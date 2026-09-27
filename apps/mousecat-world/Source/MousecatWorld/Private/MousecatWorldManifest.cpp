#include "MousecatWorldManifest.h"

#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Misc/Base64.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

FVector FMousecatCoordinateTransform::SourceMetersToLocalUnrealMeters(const FVector& SourceMeters) const
{
	return FVector(
		SourceMeters.X - LocalOriginSourceMeters.X,
		SourceMeters.Z - LocalOriginSourceMeters.Z,
		SourceMeters.Y);
}

bool FMousecatTraversalGrid::IsPassable(int32 Column, int32 Row) const
{
	if (Column < 0 || Row < 0 || Column >= Width || Row >= Height)
	{
		return false;
	}
	const int32 CellIndex = Row * Width + Column;
	const int32 ByteIndex = CellIndex >> 3;
	return Bytes.IsValidIndex(ByteIndex) && (Bytes[ByteIndex] & (1u << (CellIndex & 7))) != 0;
}

FString FMousecatSemanticGrid::GetSemantic(int32 Column, int32 Row) const
{
	if (Column < 0 || Row < 0 || Column >= Width || Row >= Height)
	{
		return FString();
	}
	const int32 CellIndex = Row * Width + Column;
	if (!CellIndices.IsValidIndex(CellIndex) || !Vocabulary.IsValidIndex(CellIndices[CellIndex]))
	{
		return FString();
	}
	return Vocabulary[CellIndices[CellIndex]];
}

FString FMousecatMapSpec::GetSemantic(int32 Column, int32 Row) const
{
	return Semantics.GetSemantic(Column, Row);
}

bool FMousecatMapSpec::IsPassable(int32 Column, int32 Row) const
{
	return Traversal.IsPassable(Column, Row);
}

FVector FMousecatMapSpec::GetSourceCellCenterMeters(int32 Column, int32 Row) const
{
	if (Column < 0 || Row < 0 || Column >= Columns || Row >= Rows)
	{
		return FVector::ZeroVector;
	}
	const double SourceColumn = bSourceColumnsDecreaseX
		? static_cast<double>(Columns - Column) - 0.5
		: static_cast<double>(Column) + 0.5;
	return FVector(
		SourceOriginMeters.X + SourceColumn * SourceCellSizeMeters.X,
		SourceOriginMeters.Y,
		SourceOriginMeters.Z + (static_cast<double>(Row) + 0.5) * SourceCellSizeMeters.Y);
}

FVector FMousecatMapSpec::GetLocalCellCenterMeters(
	int32 Column,
	int32 Row,
	const FMousecatCoordinateTransform& CoordinateTransform) const
{
	if (Column < 0 || Row < 0 || Column >= Columns || Row >= Rows)
	{
		return FVector::ZeroVector;
	}
	return CoordinateTransform.SourceMetersToLocalUnrealMeters(GetSourceCellCenterMeters(Column, Row));
}

namespace MousecatWorldManifest
{
	constexpr TCHAR ExpectedSchema[] = TEXT("mousecat.world-manifest/1");

	bool Fail(FString& OutError, const FString& Message)
	{
		OutError = Message;
		return false;
	}

	bool IsSafeId(const FString& Value)
	{
		if (Value.IsEmpty() || Value.Len() > 96)
		{
			return false;
		}

		for (const TCHAR Character : Value)
		{
			if (!(FChar::IsAlnum(Character) || Character == TEXT('-') || Character == TEXT('_') || Character == TEXT('.')))
			{
				return false;
			}
		}
		return true;
	}

	bool ReadFiniteNumber(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		double& OutValue,
		FString& OutError)
	{
		if (!Object->TryGetNumberField(Field, OutValue) || !FMath::IsFinite(OutValue))
		{
			return Fail(OutError, FString::Printf(TEXT("Field '%s' must be a finite number."), Field));
		}
		return true;
	}

	bool ReadInteger(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		int32 Minimum,
		int32 Maximum,
		int32& OutValue,
		FString& OutError)
	{
		double Number = 0.0;
		if (!ReadFiniteNumber(Object, Field, Number, OutError))
		{
			return false;
		}
		if (!FMath::IsNearlyEqual(Number, FMath::RoundToDouble(Number)) || Number < Minimum || Number > Maximum)
		{
			return Fail(OutError, FString::Printf(
				TEXT("Field '%s' must be an integer in [%d, %d]."), Field, Minimum, Maximum));
		}
		OutValue = static_cast<int32>(Number);
		return true;
	}

	bool ReadString(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		int32 MaximumLength,
		FString& OutValue,
		FString& OutError)
	{
		if (!Object->TryGetStringField(Field, OutValue))
		{
			return Fail(OutError, FString::Printf(TEXT("Field '%s' must be a string."), Field));
		}
		OutValue.TrimStartAndEndInline();
		if (OutValue.IsEmpty() || OutValue.Len() > MaximumLength)
		{
			return Fail(OutError, FString::Printf(
				TEXT("Field '%s' must contain 1 to %d characters."), Field, MaximumLength));
		}
		return true;
	}

	bool ReadVector(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		int32 Dimensions,
		TArray<double>& OutValues,
		FString& OutError)
	{
		const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
		if (!Object->TryGetArrayField(Field, Values) || Values == nullptr || Values->Num() != Dimensions)
		{
			return Fail(OutError, FString::Printf(
				TEXT("Field '%s' must be an array of %d finite numbers."), Field, Dimensions));
		}

		OutValues.Reset(Dimensions);
		for (int32 Index = 0; Index < Values->Num(); ++Index)
		{
			double Number = 0.0;
			if (!(*Values)[Index].IsValid() || !(*Values)[Index]->TryGetNumber(Number) || !FMath::IsFinite(Number))
			{
				return Fail(OutError, FString::Printf(
					TEXT("Field '%s[%d]' must be a finite number."), Field, Index));
			}
			OutValues.Add(Number);
		}
		return true;
	}

	bool ReadColor(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		FLinearColor& OutColor,
		FString& OutError)
	{
		FString Hex;
		if (!ReadString(Object, Field, 9, Hex, OutError))
		{
			return false;
		}

		if (!Hex.StartsWith(TEXT("#")) || (Hex.Len() != 7 && Hex.Len() != 9))
		{
			return Fail(OutError, FString::Printf(
				TEXT("Field '%s' must use #RRGGBB or #RRGGBBAA."), Field));
		}
		for (int32 Index = 1; Index < Hex.Len(); ++Index)
		{
			if (!FChar::IsHexDigit(Hex[Index]))
			{
				return Fail(OutError, FString::Printf(
					TEXT("Field '%s' contains a non-hexadecimal color digit."), Field));
			}
		}

		OutColor = FLinearColor(FColor::FromHex(Hex));
		return true;
	}

	bool ReadObject(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		TSharedPtr<FJsonObject>& OutObject,
		FString& OutError)
	{
		const TSharedPtr<FJsonObject>* Child = nullptr;
		if (!Object->TryGetObjectField(Field, Child) || Child == nullptr || !Child->IsValid())
		{
			return Fail(OutError, FString::Printf(TEXT("Field '%s' must be an object."), Field));
		}
		OutObject = *Child;
		return true;
	}

	bool IsSha256Identifier(const FString& Value)
	{
		constexpr int32 PrefixLength = 7;
		if (Value.Len() != PrefixLength + 64 || !Value.StartsWith(TEXT("sha256:"), ESearchCase::IgnoreCase))
		{
			return false;
		}
		for (int32 Index = PrefixLength; Index < Value.Len(); ++Index)
		{
			if (!FChar::IsHexDigit(Value[Index]))
			{
				return false;
			}
		}
		return true;
	}

	uint32 RotateRight(uint32 Value, uint32 Bits)
	{
		return (Value >> Bits) | (Value << (32 - Bits));
	}

	FSHA256Signature HashSha256(const TArray<uint8>& Bytes)
	{
		static constexpr uint32 RoundConstants[64] = {
			0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
			0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
			0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
			0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
			0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
			0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
			0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
			0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
		};
		uint32 State[8] = {
			0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
			0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
		};

		const uint64 BitLength = static_cast<uint64>(Bytes.Num()) * 8;
		const int32 PaddedLength = ((Bytes.Num() + 1 + 8 + 63) / 64) * 64;
		TArray<uint8> Message;
		Message.SetNumZeroed(PaddedLength);
		if (!Bytes.IsEmpty())
		{
			FMemory::Memcpy(Message.GetData(), Bytes.GetData(), Bytes.Num());
		}
		Message[Bytes.Num()] = 0x80;
		for (int32 Index = 0; Index < 8; ++Index)
		{
			Message[PaddedLength - 1 - Index] = static_cast<uint8>(BitLength >> (Index * 8));
		}

		for (int32 Offset = 0; Offset < PaddedLength; Offset += 64)
		{
			uint32 Words[64];
			for (int32 Index = 0; Index < 16; ++Index)
			{
				const int32 ByteIndex = Offset + Index * 4;
				Words[Index] = (static_cast<uint32>(Message[ByteIndex]) << 24) |
					(static_cast<uint32>(Message[ByteIndex + 1]) << 16) |
					(static_cast<uint32>(Message[ByteIndex + 2]) << 8) |
					static_cast<uint32>(Message[ByteIndex + 3]);
			}
			for (int32 Index = 16; Index < 64; ++Index)
			{
				const uint32 S0 = RotateRight(Words[Index - 15], 7) ^ RotateRight(Words[Index - 15], 18) ^ (Words[Index - 15] >> 3);
				const uint32 S1 = RotateRight(Words[Index - 2], 17) ^ RotateRight(Words[Index - 2], 19) ^ (Words[Index - 2] >> 10);
				Words[Index] = Words[Index - 16] + S0 + Words[Index - 7] + S1;
			}

			uint32 A = State[0];
			uint32 B = State[1];
			uint32 C = State[2];
			uint32 D = State[3];
			uint32 E = State[4];
			uint32 F = State[5];
			uint32 G = State[6];
			uint32 H = State[7];
			for (int32 Index = 0; Index < 64; ++Index)
			{
				const uint32 S1 = RotateRight(E, 6) ^ RotateRight(E, 11) ^ RotateRight(E, 25);
				const uint32 Choice = (E & F) ^ ((~E) & G);
				const uint32 Temp1 = H + S1 + Choice + RoundConstants[Index] + Words[Index];
				const uint32 S0 = RotateRight(A, 2) ^ RotateRight(A, 13) ^ RotateRight(A, 22);
				const uint32 Majority = (A & B) ^ (A & C) ^ (B & C);
				const uint32 Temp2 = S0 + Majority;
				H = G;
				G = F;
				F = E;
				E = D + Temp1;
				D = C;
				C = B;
				B = A;
				A = Temp1 + Temp2;
			}
			State[0] += A;
			State[1] += B;
			State[2] += C;
			State[3] += D;
			State[4] += E;
			State[5] += F;
			State[6] += G;
			State[7] += H;
		}

		FSHA256Signature Signature;
		for (int32 Index = 0; Index < 8; ++Index)
		{
			Signature.Signature[Index * 4] = static_cast<uint8>(State[Index] >> 24);
			Signature.Signature[Index * 4 + 1] = static_cast<uint8>(State[Index] >> 16);
			Signature.Signature[Index * 4 + 2] = static_cast<uint8>(State[Index] >> 8);
			Signature.Signature[Index * 4 + 3] = static_cast<uint8>(State[Index]);
		}
		return Signature;
	}

	bool IsRawSha256(const FString& Value)
	{
		if (Value.Len() != 64)
		{
			return false;
		}
		for (const TCHAR Character : Value)
		{
			if (!FChar::IsHexDigit(Character))
			{
				return false;
			}
		}
		return true;
	}

	bool ReadStringArray(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		int32 MinimumEntries,
		int32 MaximumEntries,
		int32 MaximumStringLength,
		TArray<FString>& OutValues,
		FString& OutError)
	{
		const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
		if (!Object->TryGetArrayField(Field, Values) || Values == nullptr ||
			Values->Num() < MinimumEntries || Values->Num() > MaximumEntries)
		{
			return Fail(OutError, FString::Printf(
				TEXT("Field '%s' must contain %d to %d strings."), Field, MinimumEntries, MaximumEntries));
		}

		OutValues.Reset(Values->Num());
		for (int32 Index = 0; Index < Values->Num(); ++Index)
		{
			FString Value;
			if (!(*Values)[Index].IsValid() || !(*Values)[Index]->TryGetString(Value))
			{
				return Fail(OutError, FString::Printf(TEXT("Field '%s[%d]' must be a string."), Field, Index));
			}
			Value.TrimStartAndEndInline();
			if (Value.IsEmpty() || Value.Len() > MaximumStringLength)
			{
				return Fail(OutError, FString::Printf(
					TEXT("Field '%s[%d]' must contain 1 to %d characters."), Field, Index, MaximumStringLength));
			}
			OutValues.Add(MoveTemp(Value));
		}
		return true;
	}

	bool ReadSourcePoint(
		const TSharedPtr<FJsonObject>& Object,
		FVector& OutValue,
		FString& OutError)
	{
		double X = 0.0;
		double Y = 0.0;
		double Z = 0.0;
		if (!ReadFiniteNumber(Object, TEXT("x"), X, OutError) ||
			!ReadFiniteNumber(Object, TEXT("y"), Y, OutError) ||
			!ReadFiniteNumber(Object, TEXT("z"), Z, OutError))
		{
			return false;
		}
		if (FMath::Abs(X) > 10000000.0 || FMath::Abs(Y) > 10000000.0 || FMath::Abs(Z) > 10000000.0)
		{
			return Fail(OutError, TEXT("Source coordinate magnitude must not exceed 10000000 metres."));
		}
		OutValue = FVector(X, Y, Z);
		return true;
	}

	bool ReadSourcePointField(
		const TSharedPtr<FJsonObject>& Object,
		const TCHAR* Field,
		FVector& OutValue,
		FString& OutError)
	{
		TSharedPtr<FJsonObject> Point;
		return ReadObject(Object, Field, Point, OutError) && ReadSourcePoint(Point, OutValue, OutError);
	}

	bool ReadUnrealPoint(
		const TSharedPtr<FJsonObject>& Object,
		FVector& OutValue,
		FString& OutError)
	{
		double X = 0.0;
		double Y = 0.0;
		double Z = 0.0;
		if (!ReadFiniteNumber(Object, TEXT("xCm"), X, OutError) ||
			!ReadFiniteNumber(Object, TEXT("yCm"), Y, OutError) ||
			!ReadFiniteNumber(Object, TEXT("zCm"), Z, OutError))
		{
			return false;
		}
		OutValue = FVector(X, Y, Z);
		return true;
	}

	FVector SourceToAbsoluteUnrealCentimeters(const FVector& SourceMeters)
	{
		return FVector(SourceMeters.X * 100.0, SourceMeters.Z * 100.0, SourceMeters.Y * 100.0);
	}

	bool ReadSourceCellSize(
		const TSharedPtr<FJsonObject>& Object,
		FVector2D& OutValue,
		FString& OutError)
	{
		double X = 0.0;
		double Z = 0.0;
		if (!ReadFiniteNumber(Object, TEXT("x"), X, OutError) ||
			!ReadFiniteNumber(Object, TEXT("z"), Z, OutError) ||
			X <= 0.0 || Z <= 0.0 || X > 10000.0 || Z > 10000.0)
		{
			return Fail(OutError, TEXT("Source cell size x/z must be in (0, 10000]."));
		}
		OutValue = FVector2D(X, Z);
		return true;
	}

	bool VerifyDecodedBytes(
		const FString& Encoded,
		int32 ExpectedBytes,
		const FString& ExpectedSha256,
		const FString& Label,
		TArray<uint8>& OutBytes,
		FString& OutError)
	{
		if (!FBase64::Decode(Encoded, OutBytes) || OutBytes.Num() != ExpectedBytes)
		{
			return Fail(OutError, FString::Printf(
				TEXT("%s must decode to exactly %d bytes; received %d."),
				*Label,
				ExpectedBytes,
				OutBytes.Num()));
		}
		if (!IsSha256Identifier(ExpectedSha256))
		{
			return Fail(OutError, FString::Printf(TEXT("%s sha256 must be a sha256: digest."), *Label));
		}
		const FString ComputedSha256 = FString(TEXT("sha256:")) + HashSha256(OutBytes).ToString();
		if (!ExpectedSha256.Equals(ComputedSha256, ESearchCase::IgnoreCase))
		{
			return Fail(OutError, FString::Printf(TEXT("%s decoded bytes do not match sha256."), *Label));
		}
		return true;
	}

	bool ReadTraversalGrid(
		const TSharedPtr<FJsonObject>& Object,
		FMousecatTraversalGrid& OutGrid,
		FString& OutError)
	{
		FString Encoded;
		if (!ReadString(Object, TEXT("encoding"), 64, OutGrid.Encoding, OutError) ||
			OutGrid.Encoding != TEXT("bitset-lsb0-base64") ||
			!ReadString(Object, TEXT("bitOrder"), 16, OutGrid.BitOrder, OutError) ||
			OutGrid.BitOrder != TEXT("lsb0") ||
			!ReadInteger(Object, TEXT("width"), 1, 4096, OutGrid.Width, OutError) ||
			!ReadInteger(Object, TEXT("height"), 1, 4096, OutGrid.Height, OutError))
		{
			return Fail(OutError, TEXT("Traversal grid encoding, bit order, or dimensions are invalid."));
		}
		const int64 CellCount = static_cast<int64>(OutGrid.Width) * OutGrid.Height;
		if (CellCount > FMousecatWorldManifestLoader::MaxManifestBytes * 8 ||
			!ReadInteger(Object, TEXT("passableCells"), 0, static_cast<int32>(CellCount), OutGrid.PassableCells, OutError) ||
			!ReadString(Object, TEXT("sha256"), 96, OutGrid.Sha256, OutError) ||
			!ReadString(Object, TEXT("dataBase64"), static_cast<int32>(FMousecatWorldManifestLoader::MaxManifestBytes), Encoded, OutError))
		{
			return false;
		}
		const int32 ExpectedBytes = static_cast<int32>((CellCount + 7) / 8);
		if (!VerifyDecodedBytes(Encoded, ExpectedBytes, OutGrid.Sha256, TEXT("Traversal grid"), OutGrid.Bytes, OutError))
		{
			return false;
		}

		int32 ComputedPassable = 0;
		for (int64 CellIndex = 0; CellIndex < CellCount; ++CellIndex)
		{
			ComputedPassable += (OutGrid.Bytes[CellIndex >> 3] >> (CellIndex & 7)) & 1u;
		}
		const int32 UsedBitsInLastByte = static_cast<int32>(CellCount & 7);
		if (UsedBitsInLastByte != 0)
		{
			const uint8 UsedMask = static_cast<uint8>((1u << UsedBitsInLastByte) - 1u);
			if ((OutGrid.Bytes.Last() & static_cast<uint8>(~UsedMask)) != 0)
			{
				return Fail(OutError, TEXT("Traversal grid has non-zero padding bits."));
			}
		}
		if (ComputedPassable != OutGrid.PassableCells)
		{
			return Fail(OutError, TEXT("Traversal grid passableCells does not match its decoded bitset."));
		}
		return true;
	}

	bool ReadSemanticGrid(
		const TSharedPtr<FJsonObject>& Object,
		FMousecatSemanticGrid& OutGrid,
		FString& OutError)
	{
		FString Encoded;
		if (!ReadString(Object, TEXT("encoding"), 64, OutGrid.Encoding, OutError) ||
			OutGrid.Encoding != TEXT("u8-vocabulary-index-base64") ||
			!ReadInteger(Object, TEXT("width"), 1, 4096, OutGrid.Width, OutError) ||
			!ReadInteger(Object, TEXT("height"), 1, 4096, OutGrid.Height, OutError) ||
			!ReadStringArray(Object, TEXT("vocabulary"), 1, 256, 64, OutGrid.Vocabulary, OutError) ||
			!ReadString(Object, TEXT("sha256"), 96, OutGrid.Sha256, OutError) ||
			!ReadString(Object, TEXT("dataBase64"), static_cast<int32>(FMousecatWorldManifestLoader::MaxManifestBytes), Encoded, OutError))
		{
			return Fail(OutError, TEXT("Semantic grid encoding, dimensions, vocabulary, hash, or payload are invalid."));
		}

		TSet<FString> VocabularySet;
		for (const FString& Entry : OutGrid.Vocabulary)
		{
			if (VocabularySet.Contains(Entry))
			{
				return Fail(OutError, TEXT("Semantic grid vocabulary entries must be unique."));
			}
			VocabularySet.Add(Entry);
		}

		const int64 CellCount = static_cast<int64>(OutGrid.Width) * OutGrid.Height;
		if (CellCount > FMousecatWorldManifestLoader::MaxManifestBytes)
		{
			return Fail(OutError, TEXT("Semantic grid exceeds the manifest byte budget."));
		}
		if (!VerifyDecodedBytes(
			Encoded,
			static_cast<int32>(CellCount),
			OutGrid.Sha256,
			TEXT("Semantic grid"),
			OutGrid.CellIndices,
			OutError))
		{
			return false;
		}
		for (int32 Index = 0; Index < OutGrid.CellIndices.Num(); ++Index)
		{
			if (!OutGrid.Vocabulary.IsValidIndex(OutGrid.CellIndices[Index]))
			{
				return Fail(OutError, FString::Printf(
					TEXT("Semantic grid cell %d references vocabulary index %d outside the vocabulary."),
					Index,
					OutGrid.CellIndices[Index]));
			}
		}
		return true;
	}

	bool ReadCoordinateTransform(
		const TSharedPtr<FJsonObject>& Root,
		FMousecatCoordinateTransform& OutTransform,
		FString& OutError)
	{
		TSharedPtr<FJsonObject> CoordinateSystem;
		TSharedPtr<FJsonObject> Source;
		TSharedPtr<FJsonObject> SourceAxes;
		TSharedPtr<FJsonObject> Target;
		TSharedPtr<FJsonObject> TargetAxes;
		TSharedPtr<FJsonObject> Equations;
		TSharedPtr<FJsonObject> RuntimeProjection;
		TSharedPtr<FJsonObject> RuntimeEquations;
		FString Unit;
		FString Handedness;
		FString AxisX;
		FString AxisY;
		FString AxisZ;
		if (!ReadObject(Root, TEXT("coordinateSystem"), CoordinateSystem, OutError) ||
			!ReadString(CoordinateSystem, TEXT("schema"), 96, OutTransform.Schema, OutError) ||
			OutTransform.Schema != TEXT("mousecat.source-to-unreal-coordinate-transform/1") ||
			!ReadObject(CoordinateSystem, TEXT("source"), Source, OutError) ||
			!ReadString(Source, TEXT("unit"), 32, Unit, OutError) || Unit != TEXT("metres") ||
			!ReadString(Source, TEXT("handedness"), 32, Handedness, OutError) || Handedness != TEXT("right-handed") ||
			!ReadObject(Source, TEXT("axes"), SourceAxes, OutError) ||
			!ReadString(SourceAxes, TEXT("x"), 32, AxisX, OutError) || AxisX != TEXT("horizontal-x") ||
			!ReadString(SourceAxes, TEXT("y"), 32, AxisY, OutError) || AxisY != TEXT("up") ||
			!ReadString(SourceAxes, TEXT("z"), 32, AxisZ, OutError) || AxisZ != TEXT("horizontal-z") ||
			!ReadObject(CoordinateSystem, TEXT("target"), Target, OutError) ||
			!ReadString(Target, TEXT("unit"), 32, Unit, OutError) || Unit != TEXT("centimetres") ||
			!ReadString(Target, TEXT("handedness"), 32, Handedness, OutError) || Handedness != TEXT("left-handed") ||
			!ReadObject(Target, TEXT("axes"), TargetAxes, OutError) ||
			!ReadString(TargetAxes, TEXT("x"), 32, AxisX, OutError) || AxisX != TEXT("source-x") ||
			!ReadString(TargetAxes, TEXT("y"), 32, AxisY, OutError) || AxisY != TEXT("source-z") ||
			!ReadString(TargetAxes, TEXT("z"), 32, AxisZ, OutError) || AxisZ != TEXT("source-y") ||
			!ReadObject(CoordinateSystem, TEXT("equations"), Equations, OutError) ||
			!ReadString(Equations, TEXT("xCm"), 64, AxisX, OutError) || AxisX != TEXT("source.xMetres * 100") ||
			!ReadString(Equations, TEXT("yCm"), 64, AxisY, OutError) || AxisY != TEXT("source.zMetres * 100") ||
			!ReadString(Equations, TEXT("zCm"), 64, AxisZ, OutError) || AxisZ != TEXT("source.yMetres * 100") ||
			!ReadObject(CoordinateSystem, TEXT("runtimeProjection"), RuntimeProjection, OutError) ||
			!ReadObject(RuntimeProjection, TEXT("equations"), RuntimeEquations, OutError) ||
			!ReadString(RuntimeEquations, TEXT("localXMetres"), 96, AxisX, OutError) ||
				AxisX != TEXT("source.xMetres - localOriginSourceMetres.x") ||
			!ReadString(RuntimeEquations, TEXT("localZMetres"), 96, AxisZ, OutError) ||
				AxisZ != TEXT("source.zMetres - localOriginSourceMetres.z") ||
			!ReadString(RuntimeEquations, TEXT("localYUpMetres"), 96, AxisY, OutError) ||
				AxisY != TEXT("source.yUpMetres"))
		{
			return Fail(OutError, TEXT("coordinateSystem does not match the source-to-Unreal transform contract."));
		}

		const TArray<TSharedPtr<FJsonValue>>* MatrixValues = nullptr;
		static constexpr double ExpectedMatrix[16] = {
			100.0, 0.0, 0.0, 0.0,
			0.0, 0.0, 100.0, 0.0,
			0.0, 100.0, 0.0, 0.0,
			0.0, 0.0, 0.0, 1.0
		};
		if (!CoordinateSystem->TryGetArrayField(TEXT("rowMajorMatrix"), MatrixValues) ||
			MatrixValues == nullptr || MatrixValues->Num() != 16)
		{
			return Fail(OutError, TEXT("coordinateSystem.rowMajorMatrix must contain the canonical 16 values."));
		}
		for (int32 Index = 0; Index < 16; ++Index)
		{
			double Value = 0.0;
			if (!(*MatrixValues)[Index].IsValid() || !(*MatrixValues)[Index]->TryGetNumber(Value) ||
				!FMath::IsNearlyEqual(Value, ExpectedMatrix[Index], 0.000001))
			{
				return Fail(OutError, TEXT("coordinateSystem.rowMajorMatrix disagrees with the source-to-Unreal transform."));
			}
		}
		int32 DeterminantSign = 0;
		if (!ReadInteger(CoordinateSystem, TEXT("linearDeterminantSign"), -1, 1, DeterminantSign, OutError) ||
			DeterminantSign != -1)
		{
			return Fail(OutError, TEXT("coordinateSystem.linearDeterminantSign must be -1."));
		}

		TArray<FString> Json2Order;
		TArray<FString> Json3Order;
		if (!ReadStringArray(Source, TEXT("json2VectorOrder"), 2, 2, 16, Json2Order, OutError) ||
			Json2Order[0] != TEXT("x") || Json2Order[1] != TEXT("z") ||
			!ReadStringArray(Source, TEXT("json3VectorOrder"), 3, 3, 16, Json3Order, OutError) ||
			Json3Order[0] != TEXT("x") || Json3Order[1] != TEXT("y-up") || Json3Order[2] != TEXT("z"))
		{
			return Fail(OutError, TEXT("coordinateSystem source vector order is invalid."));
		}

		const TArray<TSharedPtr<FJsonValue>>* OriginValues = nullptr;
		if (!RuntimeProjection->TryGetArrayField(TEXT("localOriginSourceMetres"), OriginValues) ||
			OriginValues == nullptr || OriginValues->Num() != 3)
		{
			return Fail(OutError, TEXT("coordinateSystem.runtimeProjection.localOriginSourceMetres must have 3 values."));
		}
		double Origin[3] = {};
		for (int32 Index = 0; Index < 3; ++Index)
		{
			if (!(*OriginValues)[Index].IsValid() || !(*OriginValues)[Index]->TryGetNumber(Origin[Index]) ||
				!FMath::IsFinite(Origin[Index]) || FMath::Abs(Origin[Index]) > 10000000.0)
			{
				return Fail(OutError, TEXT("coordinateSystem runtime projection origin is invalid."));
			}
		}
		OutTransform.LocalOriginSourceMeters = FVector(Origin[0], Origin[1], Origin[2]);
		return true;
	}

	bool ReadPortal(
		const TSharedPtr<FJsonObject>& Object,
		const FMousecatMapSpec& SourceMap,
		FMousecatPortalSpec& OutPortal,
		FString& OutError)
	{
		TSharedPtr<FJsonObject> Resolution;
		TSharedPtr<FJsonObject> Source;
		if (!ReadString(Object, TEXT("id"), 96, OutPortal.Id, OutError) || !IsSafeId(OutPortal.Id) ||
			!ReadString(Object, TEXT("mapId"), 96, OutPortal.MapId, OutError) || !IsSafeId(OutPortal.MapId) ||
			OutPortal.MapId != SourceMap.Id ||
			!ReadString(Object, TEXT("kind"), 64, OutPortal.Kind, OutError) ||
			!ReadString(Object, TEXT("mode"), 64, OutPortal.Mode, OutError) ||
			!ReadString(Object, TEXT("regionTransition"), 64, OutPortal.RegionTransition, OutError) ||
			!ReadObject(Object, TEXT("resolution"), Resolution, OutError) ||
			!ReadString(Resolution, TEXT("kind"), 64, OutPortal.ResolutionKind, OutError) ||
			!ReadObject(Object, TEXT("source"), Source, OutError) ||
			!ReadString(Source, TEXT("path"), 512, OutPortal.SourcePath, OutError) ||
			!ReadString(Source, TEXT("sha256"), 64, OutPortal.SourceSha256, OutError) ||
			!IsRawSha256(OutPortal.SourceSha256))
		{
			return Fail(OutError, FString::Printf(TEXT("Portal '%s' core fields are invalid: %s"), *OutPortal.Id, *OutError));
		}

		if (Resolution->HasField(TEXT("targetMapId")) &&
			(!ReadString(Resolution, TEXT("targetMapId"), 96, OutPortal.TargetMapId, OutError) || !IsSafeId(OutPortal.TargetMapId)))
		{
			return Fail(OutError, FString::Printf(TEXT("Portal '%s' targetMapId is invalid."), *OutPortal.Id));
		}
		if (Resolution->HasField(TEXT("targetGateId")) &&
			(!ReadString(Resolution, TEXT("targetGateId"), 96, OutPortal.TargetGateId, OutError) || !IsSafeId(OutPortal.TargetGateId)))
		{
			return Fail(OutError, FString::Printf(TEXT("Portal '%s' targetGateId is invalid."), *OutPortal.Id));
		}
		if (OutPortal.ResolutionKind == TEXT("fixed") &&
			(OutPortal.TargetMapId.IsEmpty() || OutPortal.TargetGateId.IsEmpty()))
		{
			return Fail(OutError, FString::Printf(TEXT("Fixed portal '%s' requires target map and gate IDs."), *OutPortal.Id));
		}

		if (Source->HasField(TEXT("symbol")) &&
			!ReadString(Source, TEXT("symbol"), 256, OutPortal.SourceSymbol, OutError))
		{
			return false;
		}
		if (Source->HasField(TEXT("lineStart")) &&
			!ReadInteger(Source, TEXT("lineStart"), 0, 1000000000, OutPortal.SourceLineStart, OutError))
		{
			return false;
		}
		if (Source->HasField(TEXT("ordinal")) &&
			!ReadInteger(Source, TEXT("ordinal"), 0, 1000000000, OutPortal.SourceOrdinal, OutError))
		{
			return false;
		}

		if (Object->HasField(TEXT("sourceCell")))
		{
			TSharedPtr<FJsonObject> SourceCell;
			int32 Column = 0;
			int32 Row = 0;
			if (!ReadObject(Object, TEXT("sourceCell"), SourceCell, OutError) ||
				!ReadInteger(SourceCell, TEXT("column"), 0, SourceMap.Columns - 1, Column, OutError) ||
				!ReadInteger(SourceCell, TEXT("row"), 0, SourceMap.Rows - 1, Row, OutError))
			{
				return Fail(OutError, FString::Printf(TEXT("Portal '%s' sourceCell is invalid."), *OutPortal.Id));
			}
			OutPortal.bHasSourceCell = true;
			OutPortal.SourceCell = FIntPoint(Column, Row);
		}
		if (Object->HasField(TEXT("sourceWorldMetres")))
		{
			if (!ReadSourcePointField(Object, TEXT("sourceWorldMetres"), OutPortal.SourceWorldMeters, OutError))
			{
				return false;
			}
			OutPortal.bHasSourceWorldMeters = true;
		}
		if (Object->HasField(TEXT("unrealWorldCentimetres")))
		{
			TSharedPtr<FJsonObject> UnrealPoint;
			if (!ReadObject(Object, TEXT("unrealWorldCentimetres"), UnrealPoint, OutError) ||
				!ReadUnrealPoint(UnrealPoint, OutPortal.UnrealWorldCentimeters, OutError))
			{
				return false;
			}
			OutPortal.bHasUnrealWorldCentimeters = true;
		}
		if (Object->HasField(TEXT("boundary")))
		{
			TSharedPtr<FJsonObject> Boundary;
			if (!ReadObject(Object, TEXT("boundary"), Boundary, OutError) ||
				!ReadString(Boundary, TEXT("direction"), 16, OutPortal.BoundaryDirection, OutError) ||
				(OutPortal.BoundaryDirection != TEXT("north") && OutPortal.BoundaryDirection != TEXT("south") &&
					OutPortal.BoundaryDirection != TEXT("east") && OutPortal.BoundaryDirection != TEXT("west")) ||
				!ReadInteger(Boundary, TEXT("offset"), -1000000, 1000000, OutPortal.BoundaryOffset, OutError))
			{
				return Fail(OutError, FString::Printf(TEXT("Portal '%s' boundary is invalid."), *OutPortal.Id));
			}
			OutPortal.bHasBoundary = true;
		}
		if (Object->HasField(TEXT("availability")))
		{
			TSharedPtr<FJsonObject> Availability;
			if (!ReadObject(Object, TEXT("availability"), Availability, OutError) ||
				!ReadString(Availability, TEXT("state"), 64, OutPortal.AvailabilityState, OutError) ||
				!ReadString(Availability, TEXT("authority"), 128, OutPortal.AvailabilityAuthority, OutError) ||
				!ReadString(Availability, TEXT("policy"), 128, OutPortal.AvailabilityPolicy, OutError))
			{
				return false;
			}
			OutPortal.bHasAvailability = true;
		}

		if (OutPortal.Kind == TEXT("warp-point"))
		{
			if (OutPortal.Mode != TEXT("warp") || !OutPortal.bHasSourceCell || !OutPortal.bHasSourceWorldMeters ||
				!OutPortal.bHasUnrealWorldCentimeters || OutPortal.bHasBoundary)
			{
				return Fail(OutError, FString::Printf(TEXT("Warp portal '%s' has an invalid spatial shape."), *OutPortal.Id));
			}
		}
		else if (OutPortal.Kind == TEXT("connection-boundary"))
		{
			if (OutPortal.Mode != TEXT("walk") || !OutPortal.bHasBoundary || OutPortal.bHasSourceCell ||
				OutPortal.bHasSourceWorldMeters || OutPortal.bHasUnrealWorldCentimeters)
			{
				return Fail(OutError, FString::Printf(TEXT("Boundary portal '%s' has an invalid spatial shape."), *OutPortal.Id));
			}
		}
		else
		{
			return Fail(OutError, FString::Printf(TEXT("Portal '%s' has unsupported kind '%s'."), *OutPortal.Id, *OutPortal.Kind));
		}

		if (OutPortal.bHasSourceCell)
		{
			const FVector ExpectedSource = SourceMap.GetSourceCellCenterMeters(OutPortal.SourceCell.X, OutPortal.SourceCell.Y);
			const FVector ExpectedUnreal = SourceToAbsoluteUnrealCentimeters(ExpectedSource);
			if (!OutPortal.SourceWorldMeters.Equals(ExpectedSource, 0.001) ||
				!OutPortal.UnrealWorldCentimeters.Equals(ExpectedUnreal, 0.01))
			{
				return Fail(OutError, FString::Printf(
					TEXT("Portal '%s' absolute positions do not match its map cell and source frame."), *OutPortal.Id));
			}
		}
		return true;
	}

	bool ArePortalsEquivalent(const FMousecatPortalSpec& Left, const FMousecatPortalSpec& Right)
	{
		return Left.Id == Right.Id && Left.MapId == Right.MapId && Left.Kind == Right.Kind && Left.Mode == Right.Mode &&
			Left.RegionTransition == Right.RegionTransition && Left.ResolutionKind == Right.ResolutionKind &&
			Left.TargetMapId == Right.TargetMapId && Left.TargetGateId == Right.TargetGateId &&
			Left.SourcePath == Right.SourcePath && Left.SourceSha256 == Right.SourceSha256 &&
			Left.SourceSymbol == Right.SourceSymbol && Left.SourceLineStart == Right.SourceLineStart &&
			Left.SourceOrdinal == Right.SourceOrdinal && Left.bHasSourceCell == Right.bHasSourceCell &&
			(!Left.bHasSourceCell || Left.SourceCell == Right.SourceCell) &&
			Left.bHasSourceWorldMeters == Right.bHasSourceWorldMeters &&
			(!Left.bHasSourceWorldMeters || Left.SourceWorldMeters.Equals(Right.SourceWorldMeters, 0.001)) &&
			Left.bHasUnrealWorldCentimeters == Right.bHasUnrealWorldCentimeters &&
			(!Left.bHasUnrealWorldCentimeters || Left.UnrealWorldCentimeters.Equals(Right.UnrealWorldCentimeters, 0.01)) &&
			Left.bHasBoundary == Right.bHasBoundary &&
			(!Left.bHasBoundary || (Left.BoundaryDirection == Right.BoundaryDirection && Left.BoundaryOffset == Right.BoundaryOffset)) &&
			Left.bHasAvailability == Right.bHasAvailability &&
			(!Left.bHasAvailability || (Left.AvailabilityState == Right.AvailabilityState &&
				Left.AvailabilityAuthority == Right.AvailabilityAuthority && Left.AvailabilityPolicy == Right.AvailabilityPolicy));
	}

	bool ReadMap(
		const TSharedPtr<FJsonObject>& Object,
		FMousecatMapSpec& OutMap,
		TArray<FMousecatPortalSpec>& OutEmbeddedPortals,
		FString& OutError)
	{
		TSharedPtr<FJsonObject> Dimensions;
		TSharedPtr<FJsonObject> SourceFrame;
		TSharedPtr<FJsonObject> SourceCellSize;
		TSharedPtr<FJsonObject> SourceBounds;
		TSharedPtr<FJsonObject> Traversal;
		TSharedPtr<FJsonObject> Semantics;
		FString SourceUnit;
		FString SourceColumnDirection;
		FString SourceRowDirection;
		if (!ReadString(Object, TEXT("id"), 96, OutMap.Id, OutError) || !IsSafeId(OutMap.Id) ||
			!ReadString(Object, TEXT("label"), 128, OutMap.Label, OutError) ||
			!ReadString(Object, TEXT("type"), 64, OutMap.Type, OutError) ||
			!ReadInteger(Object, TEXT("priority"), -1000000, 1000000, OutMap.Priority, OutError) ||
			!ReadObject(Object, TEXT("dimensions"), Dimensions, OutError) ||
			!ReadInteger(Dimensions, TEXT("columns"), 1, 4096, OutMap.Columns, OutError) ||
			!ReadInteger(Dimensions, TEXT("rows"), 1, 4096, OutMap.Rows, OutError) ||
			!ReadObject(Object, TEXT("sourceFrame"), SourceFrame, OutError) ||
			!ReadString(SourceFrame, TEXT("unit"), 32, SourceUnit, OutError) || SourceUnit != TEXT("metres") ||
			!ReadSourcePointField(SourceFrame, TEXT("originAtMinimumBounds"), OutMap.SourceOriginMeters, OutError) ||
			!ReadObject(SourceFrame, TEXT("cellSize"), SourceCellSize, OutError) ||
			!ReadSourceCellSize(SourceCellSize, OutMap.SourceCellSizeMeters, OutError) ||
			!ReadString(SourceFrame, TEXT("sourceColumnDirection"), 32, SourceColumnDirection, OutError) ||
			!ReadString(SourceFrame, TEXT("sourceRowDirection"), 32, SourceRowDirection, OutError) ||
			!ReadObject(SourceFrame, TEXT("bounds"), SourceBounds, OutError) ||
			!ReadSourcePointField(SourceBounds, TEXT("min"), OutMap.SourceBoundsMinMeters, OutError) ||
			!ReadSourcePointField(SourceBounds, TEXT("maxExclusive"), OutMap.SourceBoundsMaxExclusiveMeters, OutError) ||
			!ReadObject(Object, TEXT("traversal"), Traversal, OutError) ||
			!ReadTraversalGrid(Traversal, OutMap.Traversal, OutError) ||
			!ReadObject(Object, TEXT("semantics"), Semantics, OutError) ||
			!ReadSemanticGrid(Semantics, OutMap.Semantics, OutError))
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' is invalid: %s"), *OutMap.Id, *OutError));
		}
		if (SourceColumnDirection != TEXT("positive-x") && SourceColumnDirection != TEXT("negative-x"))
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' has invalid source column direction."), *OutMap.Id));
		}
		OutMap.bSourceColumnsDecreaseX = SourceColumnDirection == TEXT("negative-x");
		if (SourceRowDirection != TEXT("positive-z") ||
			OutMap.Traversal.Width != OutMap.Columns || OutMap.Traversal.Height != OutMap.Rows ||
			OutMap.Semantics.Width != OutMap.Columns || OutMap.Semantics.Height != OutMap.Rows)
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' grid dimensions or row direction disagree."), *OutMap.Id));
		}
		const FVector ExpectedSourceMax(
			OutMap.SourceOriginMeters.X + OutMap.Columns * OutMap.SourceCellSizeMeters.X,
			OutMap.SourceOriginMeters.Y,
			OutMap.SourceOriginMeters.Z + OutMap.Rows * OutMap.SourceCellSizeMeters.Y);
		if (!OutMap.SourceBoundsMinMeters.Equals(OutMap.SourceOriginMeters, 0.001) ||
			!OutMap.SourceBoundsMaxExclusiveMeters.Equals(ExpectedSourceMax, 0.001))
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' source bounds do not match its dimensions."), *OutMap.Id));
		}

		TSharedPtr<FJsonObject> UnrealFrame;
		TSharedPtr<FJsonObject> UnrealOrigin;
		TSharedPtr<FJsonObject> UnrealCellSize;
		TSharedPtr<FJsonObject> UnrealBounds;
		FString UnrealUnit;
		FString UnrealColumnDirection;
		FString UnrealRowDirection;
		FVector UnrealOriginValue;
		FVector UnrealBoundsMin;
		FVector UnrealBoundsMax;
		double UnrealCellX = 0.0;
		double UnrealCellY = 0.0;
		if (!ReadObject(Object, TEXT("unrealFrame"), UnrealFrame, OutError) ||
			!ReadString(UnrealFrame, TEXT("unit"), 32, UnrealUnit, OutError) || UnrealUnit != TEXT("centimetres") ||
			!ReadObject(UnrealFrame, TEXT("originAtMinimumBounds"), UnrealOrigin, OutError) ||
			!ReadUnrealPoint(UnrealOrigin, UnrealOriginValue, OutError) ||
			!ReadObject(UnrealFrame, TEXT("cellSize"), UnrealCellSize, OutError) ||
			!ReadFiniteNumber(UnrealCellSize, TEXT("xCm"), UnrealCellX, OutError) ||
			!ReadFiniteNumber(UnrealCellSize, TEXT("yCm"), UnrealCellY, OutError) ||
			!ReadString(UnrealFrame, TEXT("sourceColumnDirection"), 32, UnrealColumnDirection, OutError) ||
			!ReadString(UnrealFrame, TEXT("sourceRowDirection"), 32, UnrealRowDirection, OutError) ||
			!ReadObject(UnrealFrame, TEXT("bounds"), UnrealBounds, OutError) ||
			!ReadObject(UnrealBounds, TEXT("min"), UnrealOrigin, OutError) ||
			!ReadUnrealPoint(UnrealOrigin, UnrealBoundsMin, OutError) ||
			!ReadObject(UnrealBounds, TEXT("maxExclusive"), UnrealOrigin, OutError) ||
			!ReadUnrealPoint(UnrealOrigin, UnrealBoundsMax, OutError))
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' unrealFrame is invalid."), *OutMap.Id));
		}
		if (UnrealColumnDirection != SourceColumnDirection || UnrealRowDirection != TEXT("positive-y") ||
			!FMath::IsNearlyEqual(UnrealCellX, OutMap.SourceCellSizeMeters.X * 100.0, 0.001) ||
			!FMath::IsNearlyEqual(UnrealCellY, OutMap.SourceCellSizeMeters.Y * 100.0, 0.001) ||
			!UnrealOriginValue.Equals(SourceToAbsoluteUnrealCentimeters(OutMap.SourceOriginMeters), 0.01) ||
			!UnrealBoundsMin.Equals(SourceToAbsoluteUnrealCentimeters(OutMap.SourceBoundsMinMeters), 0.01) ||
			!UnrealBoundsMax.Equals(SourceToAbsoluteUnrealCentimeters(OutMap.SourceBoundsMaxExclusiveMeters), 0.01))
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' unrealFrame disagrees with its source frame."), *OutMap.Id));
		}

		const TArray<TSharedPtr<FJsonValue>>* PortalValues = nullptr;
		if (!Object->TryGetArrayField(TEXT("portals"), PortalValues) || PortalValues == nullptr || PortalValues->Num() > 4096)
		{
			return Fail(OutError, FString::Printf(TEXT("Map '%s' portals must be an array within the safety budget."), *OutMap.Id));
		}
		TSet<FString> PortalIds;
		for (int32 Index = 0; Index < PortalValues->Num(); ++Index)
		{
			const TSharedPtr<FJsonObject> PortalObject = (*PortalValues)[Index]->AsObject();
			FMousecatPortalSpec Portal;
			if (!PortalObject.IsValid() || !ReadPortal(PortalObject, OutMap, Portal, OutError) || PortalIds.Contains(Portal.Id))
			{
				return Fail(OutError, FString::Printf(TEXT("Map '%s' portal %d is invalid or duplicated: %s"), *OutMap.Id, Index, *OutError));
			}
			PortalIds.Add(Portal.Id);
			OutMap.PortalIds.Add(Portal.Id);
			OutEmbeddedPortals.Add(MoveTemp(Portal));
		}
		return true;
	}

	bool ReadRuntimeParcel(
		const TSharedPtr<FJsonObject>& Object,
		FMousecatRuntimeParcelSpec& OutParcel,
		FString& OutError)
	{
		TSharedPtr<FJsonObject> Dimensions;
		TSharedPtr<FJsonObject> SourceFrame;
		TSharedPtr<FJsonObject> CellSize;
		TSharedPtr<FJsonObject> Bounds;
		if (!ReadString(Object, TEXT("id"), 96, OutParcel.Id, OutError) || !IsSafeId(OutParcel.Id) ||
			!ReadString(Object, TEXT("kind"), 64, OutParcel.Kind, OutError) ||
			!ReadObject(Object, TEXT("dimensions"), Dimensions, OutError) ||
			!ReadInteger(Dimensions, TEXT("columns"), 1, 4096, OutParcel.Columns, OutError) ||
			!ReadInteger(Dimensions, TEXT("rows"), 1, 4096, OutParcel.Rows, OutError) ||
			!ReadObject(Object, TEXT("sourceFrame"), SourceFrame, OutError) ||
			!ReadSourcePointField(SourceFrame, TEXT("originMetres"), OutParcel.SourceOriginMeters, OutError) ||
			!ReadObject(SourceFrame, TEXT("cellSizeMetres"), CellSize, OutError) ||
			!ReadSourceCellSize(CellSize, OutParcel.SourceCellSizeMeters, OutError) ||
			!ReadObject(SourceFrame, TEXT("bounds"), Bounds, OutError) ||
			!ReadSourcePointField(Bounds, TEXT("min"), OutParcel.SourceBoundsMinMeters, OutError) ||
			!ReadSourcePointField(Bounds, TEXT("maxExclusive"), OutParcel.SourceBoundsMaxExclusiveMeters, OutError))
		{
			return Fail(OutError, FString::Printf(TEXT("Runtime parcel '%s' is invalid: %s"), *OutParcel.Id, *OutError));
		}
		const FVector ExpectedMax(
			OutParcel.SourceOriginMeters.X + OutParcel.Columns * OutParcel.SourceCellSizeMeters.X,
			OutParcel.SourceOriginMeters.Y,
			OutParcel.SourceOriginMeters.Z + OutParcel.Rows * OutParcel.SourceCellSizeMeters.Y);
		if (!OutParcel.SourceBoundsMinMeters.Equals(OutParcel.SourceOriginMeters, 0.001) ||
			!OutParcel.SourceBoundsMaxExclusiveMeters.Equals(ExpectedMax, 0.001))
		{
			return Fail(OutError, FString::Printf(TEXT("Runtime parcel '%s' bounds do not match its dimensions."), *OutParcel.Id));
		}
		return true;
	}

	bool ReadMappedWorld(
		const TSharedPtr<FJsonObject>& Root,
		FMousecatWorldManifest& OutManifest,
		FString& OutError)
	{
		const bool bRequiresMappedWorld = OutManifest.Terrain.Authority == TEXT("sampled-source");
		const bool bHasCoordinateSystem = Root->HasField(TEXT("coordinateSystem"));
		const bool bHasMaps = Root->HasField(TEXT("maps"));
		const bool bHasPortals = Root->HasField(TEXT("portals"));
		const bool bHasRuntimeParcels = Root->HasField(TEXT("runtimeParcels"));
		const bool bHasAnyMappedWorld = bHasCoordinateSystem || bHasMaps || bHasPortals || bHasRuntimeParcels;
		if (!bRequiresMappedWorld && !bHasAnyMappedWorld)
		{
			return true;
		}
		if (!bHasCoordinateSystem || !bHasMaps || !bHasPortals || !bHasRuntimeParcels)
		{
			return Fail(OutError, TEXT("Mapped-world ingestion requires coordinateSystem, maps, portals, and runtimeParcels together."));
		}
		if (!ReadCoordinateTransform(Root, OutManifest.CoordinateTransform, OutError))
		{
			return false;
		}

		const TArray<TSharedPtr<FJsonValue>>* MapValues = nullptr;
		if (!Root->TryGetArrayField(TEXT("maps"), MapValues) || MapValues == nullptr ||
			MapValues->IsEmpty() || MapValues->Num() > 512)
		{
			return Fail(OutError, TEXT("maps must contain 1 to 512 records."));
		}
		TMap<FString, int32> MapIndexById;
		TMap<FString, FMousecatPortalSpec> EmbeddedPortalById;
		for (int32 Index = 0; Index < MapValues->Num(); ++Index)
		{
			const TSharedPtr<FJsonObject> MapObject = (*MapValues)[Index]->AsObject();
			FMousecatMapSpec Map;
			TArray<FMousecatPortalSpec> EmbeddedPortals;
			if (!MapObject.IsValid() || !ReadMap(MapObject, Map, EmbeddedPortals, OutError) || MapIndexById.Contains(Map.Id))
			{
				return Fail(OutError, FString::Printf(TEXT("Map %d is invalid or duplicated: %s"), Index, *OutError));
			}
			for (FMousecatPortalSpec& Portal : EmbeddedPortals)
			{
				if (EmbeddedPortalById.Contains(Portal.Id))
				{
					return Fail(OutError, FString::Printf(TEXT("Embedded portal ID '%s' is duplicated."), *Portal.Id));
				}
				EmbeddedPortalById.Add(Portal.Id, MoveTemp(Portal));
			}
			MapIndexById.Add(Map.Id, OutManifest.Maps.Num());
			OutManifest.Maps.Add(MoveTemp(Map));
		}

		const TArray<TSharedPtr<FJsonValue>>* PortalValues = nullptr;
		if (!Root->TryGetArrayField(TEXT("portals"), PortalValues) || PortalValues == nullptr || PortalValues->Num() > 4096)
		{
			return Fail(OutError, TEXT("portals must be an array with at most 4096 records."));
		}
		TMap<FString, int32> PortalIndexById;
		for (int32 Index = 0; Index < PortalValues->Num(); ++Index)
		{
			const TSharedPtr<FJsonObject> PortalObject = (*PortalValues)[Index]->AsObject();
			FString MapId;
			if (!PortalObject.IsValid() || !ReadString(PortalObject, TEXT("mapId"), 96, MapId, OutError))
			{
				return Fail(OutError, FString::Printf(TEXT("Top-level portal %d has no valid source map."), Index));
			}
			const int32* MapIndex = MapIndexById.Find(MapId);
			if (MapIndex == nullptr)
			{
				return Fail(OutError, FString::Printf(TEXT("Top-level portal %d references absent source map '%s'."), Index, *MapId));
			}
			FMousecatPortalSpec Portal;
			if (!ReadPortal(PortalObject, OutManifest.Maps[*MapIndex], Portal, OutError) || PortalIndexById.Contains(Portal.Id))
			{
				return Fail(OutError, FString::Printf(TEXT("Top-level portal %d is invalid or duplicated: %s"), Index, *OutError));
			}
			const FMousecatPortalSpec* Embedded = EmbeddedPortalById.Find(Portal.Id);
			if (Embedded == nullptr || !ArePortalsEquivalent(*Embedded, Portal))
			{
				return Fail(OutError, FString::Printf(
					TEXT("Top-level portal '%s' does not exactly match its map portal record."), *Portal.Id));
			}
			PortalIndexById.Add(Portal.Id, OutManifest.Portals.Num());
			OutManifest.Portals.Add(MoveTemp(Portal));
		}
		if (EmbeddedPortalById.Num() != OutManifest.Portals.Num())
		{
			return Fail(OutError, TEXT("Top-level portal set does not equal the union of map portal sets."));
		}

		for (const FMousecatPortalSpec& Portal : OutManifest.Portals)
		{
			const int32* IncludedTargetMapIndex = MapIndexById.Find(Portal.TargetMapId);
			if (IncludedTargetMapIndex == nullptr)
			{
				continue;
			}
			const int32* TargetPortalIndex = PortalIndexById.Find(Portal.TargetGateId);
			if (TargetPortalIndex == nullptr || OutManifest.Portals[*TargetPortalIndex].MapId != Portal.TargetMapId)
			{
				return Fail(OutError, FString::Printf(
					TEXT("Portal '%s' target gate does not belong to its included target map."), *Portal.Id));
			}
		}

		const TArray<TSharedPtr<FJsonValue>>* ParcelValues = nullptr;
		if (!Root->TryGetArrayField(TEXT("runtimeParcels"), ParcelValues) || ParcelValues == nullptr || ParcelValues->Num() > 512)
		{
			return Fail(OutError, TEXT("runtimeParcels must be an array with at most 512 records."));
		}
		TSet<FString> ParcelIds;
		for (int32 Index = 0; Index < ParcelValues->Num(); ++Index)
		{
			const TSharedPtr<FJsonObject> ParcelObject = (*ParcelValues)[Index]->AsObject();
			FMousecatRuntimeParcelSpec Parcel;
			if (!ParcelObject.IsValid() || !ReadRuntimeParcel(ParcelObject, Parcel, OutError) || ParcelIds.Contains(Parcel.Id))
			{
				return Fail(OutError, FString::Printf(TEXT("Runtime parcel %d is invalid or duplicated: %s"), Index, *OutError));
			}
			ParcelIds.Add(Parcel.Id);
			OutManifest.RuntimeParcels.Add(MoveTemp(Parcel));
		}
		return true;
	}

	bool VerifySampledSourceReceipt(
		const FString& ManifestPath,
		const TArray<uint8>& ManifestBytes,
		const FMousecatWorldManifest& Candidate,
		FString& OutError)
	{
		constexpr TCHAR ReceiptSchema[] = TEXT("mousecat.unreal-region-export-receipt/1");
		const FString ReceiptPath = FPaths::ChangeExtension(ManifestPath, TEXT("receipt.json"));
		const int64 ReceiptSize = IFileManager::Get().FileSize(*ReceiptPath);
		if (ReceiptSize < 1 || ReceiptSize > FMousecatWorldManifestLoader::MaxReceiptBytes)
		{
			return Fail(OutError, FString::Printf(
				TEXT("Sampled-source manifest requires sibling receipt %s with size in [1, %lld] bytes."),
				*ReceiptPath,
				FMousecatWorldManifestLoader::MaxReceiptBytes));
		}

		FString ReceiptJson;
		if (!FFileHelper::LoadFileToString(ReceiptJson, *ReceiptPath))
		{
			return Fail(OutError, FString::Printf(TEXT("Sampled-source receipt could not be read: %s"), *ReceiptPath));
		}

		TSharedPtr<FJsonObject> Receipt;
		const TSharedRef<TJsonReader<>> ReceiptReader = TJsonReaderFactory<>::Create(ReceiptJson);
		if (!FJsonSerializer::Deserialize(ReceiptReader, Receipt) || !Receipt.IsValid())
		{
			return Fail(OutError, TEXT("Sampled-source receipt is not valid JSON."));
		}

		FString Schema;
		FString ExportSemanticHash;
		FString WorldId;
		FString RegionId;
		TSharedPtr<FJsonObject> Artifact;
		FString ArtifactFileName;
		FString ArtifactSha256;
		int32 ArtifactBytes = 0;
		if (!ReadString(Receipt, TEXT("schema"), 96, Schema, OutError) || Schema != ReceiptSchema ||
			!ReadString(Receipt, TEXT("exportSemanticHash"), 96, ExportSemanticHash, OutError) ||
			!ReadString(Receipt, TEXT("worldId"), 96, WorldId, OutError) ||
			!ReadString(Receipt, TEXT("regionId"), 96, RegionId, OutError) ||
			!ReadObject(Receipt, TEXT("artifact"), Artifact, OutError) ||
			!ReadString(Artifact, TEXT("fileName"), 128, ArtifactFileName, OutError) ||
			!ReadInteger(Artifact, TEXT("bytes"), 1, static_cast<int32>(FMousecatWorldManifestLoader::MaxManifestBytes), ArtifactBytes, OutError) ||
			!ReadString(Artifact, TEXT("sha256"), 96, ArtifactSha256, OutError))
		{
			if (Schema != ReceiptSchema)
			{
				OutError = FString::Printf(TEXT("Sampled-source receipt schema must be exactly '%s'."), ReceiptSchema);
			}
			return false;
		}

		if (!IsSha256Identifier(Candidate.SemanticHash) || !IsSha256Identifier(ExportSemanticHash) ||
			!Candidate.SemanticHash.Equals(ExportSemanticHash, ESearchCase::IgnoreCase))
		{
			return Fail(OutError, TEXT("Sampled-source manifest semanticHash does not match receipt exportSemanticHash."));
		}
		if (ArtifactFileName != FPaths::GetCleanFilename(ManifestPath))
		{
			return Fail(OutError, TEXT("Sampled-source receipt artifact filename does not match the selected manifest."));
		}
		if (ArtifactBytes != ManifestBytes.Num())
		{
			return Fail(OutError, TEXT("Sampled-source receipt artifact byte count does not match the selected manifest."));
		}
		if (WorldId != Candidate.WorldId || Candidate.Regions.IsEmpty() || RegionId != Candidate.Regions[0].Id)
		{
			return Fail(OutError, TEXT("Sampled-source receipt world or first region identity does not match the selected manifest."));
		}
		if (!IsSha256Identifier(ArtifactSha256))
		{
			return Fail(OutError, TEXT("Sampled-source receipt artifact.sha256 must be a sha256: digest."));
		}

		const FSHA256Signature Signature = HashSha256(ManifestBytes);
		const FString ComputedSha256 = FString(TEXT("sha256:")) + Signature.ToString();
		if (!ArtifactSha256.Equals(ComputedSha256, ESearchCase::IgnoreCase))
		{
			return Fail(OutError, TEXT("Sampled-source receipt SHA-256 does not match the selected manifest bytes."));
		}
		return true;
	}
}

bool FMousecatWorldManifestLoader::LoadFromFile(
	const FString& AbsolutePath,
	FMousecatWorldManifest& OutManifest,
	FString& OutError)
{
	using namespace MousecatWorldManifest;

	OutError.Reset();
	const int64 FileSize = IFileManager::Get().FileSize(*AbsolutePath);
	if (FileSize < 0)
	{
		return Fail(OutError, FString::Printf(TEXT("Manifest does not exist: %s"), *AbsolutePath));
	}
	if (FileSize == 0 || FileSize > MaxManifestBytes)
	{
		return Fail(OutError, FString::Printf(
			TEXT("Manifest size must be between 1 and %lld bytes; received %lld."), MaxManifestBytes, FileSize));
	}

	TArray<uint8> ManifestBytes;
	if (!FFileHelper::LoadFileToArray(ManifestBytes, *AbsolutePath) || ManifestBytes.Num() != FileSize)
	{
		return Fail(OutError, FString::Printf(TEXT("Manifest bytes could not be read exactly: %s"), *AbsolutePath));
	}

	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *AbsolutePath))
	{
		return Fail(OutError, FString::Printf(TEXT("Manifest could not be read: %s"), *AbsolutePath));
	}

	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		return Fail(OutError, TEXT("Manifest is not valid JSON."));
	}

	FMousecatWorldManifest Candidate;
	if (!ReadString(Root, TEXT("schema"), 64, Candidate.Schema, OutError) ||
		Candidate.Schema != ExpectedSchema)
	{
		return Fail(OutError, FString::Printf(
			TEXT("Manifest schema must be exactly '%s'."), ExpectedSchema));
	}
	Root->TryGetStringField(TEXT("semanticHash"), Candidate.SemanticHash);
	Candidate.SemanticHash.TrimStartAndEndInline();

	TSharedPtr<FJsonObject> WorldObject;
	if (!ReadObject(Root, TEXT("world"), WorldObject, OutError) ||
		!ReadString(WorldObject, TEXT("id"), 96, Candidate.WorldId, OutError) ||
		!IsSafeId(Candidate.WorldId) ||
		!ReadString(WorldObject, TEXT("displayName"), 128, Candidate.DisplayName, OutError) ||
		!ReadString(WorldObject, TEXT("sourceLabel"), 256, Candidate.SourceLabel, OutError))
	{
		if (OutError.IsEmpty())
		{
			OutError = TEXT("world.id may contain only letters, digits, dots, underscores, and hyphens.");
		}
		return false;
	}

	TArray<double> SpawnValues;
	if (!ReadVector(WorldObject, TEXT("playerSpawnMeters"), 3, SpawnValues, OutError))
	{
		return false;
	}
	// Source/web coordinates are x,z-horizontal with y-up. UE uses x,y-horizontal with z-up.
	Candidate.PlayerSpawnMeters = FVector(SpawnValues[0], SpawnValues[2], SpawnValues[1]);
	if (Candidate.PlayerSpawnMeters.Z < -2000.0 || Candidate.PlayerSpawnMeters.Z > 2000.0)
	{
		return Fail(OutError, TEXT("world.playerSpawnMeters absolute source y-up coordinate must be in [-2000, 2000]."));
	}

	TSharedPtr<FJsonObject> TerrainObject;
	if (!ReadObject(Root, TEXT("terrain"), TerrainObject, OutError) ||
		!ReadString(TerrainObject, TEXT("authority"), 64, Candidate.Terrain.Authority, OutError) ||
		!ReadInteger(TerrainObject, TEXT("columns"), 2, 513, Candidate.Terrain.Columns, OutError) ||
		!ReadInteger(TerrainObject, TEXT("rows"), 2, 513, Candidate.Terrain.Rows, OutError))
	{
		return false;
	}
	if (Candidate.Terrain.Authority != TEXT("sampled-source") &&
		Candidate.Terrain.Authority != TEXT("synthetic-fallback"))
	{
		return Fail(OutError, TEXT("terrain.authority must be 'sampled-source' or 'synthetic-fallback'."));
	}

	double Number = 0.0;
	if (!ReadFiniteNumber(TerrainObject, TEXT("cellSizeMeters"), Number, OutError) || Number < 0.25 || Number > 100.0)
	{
		return Fail(OutError, TEXT("terrain.cellSizeMeters must be in [0.25, 100]."));
	}
	Candidate.Terrain.CellSizeMeters = Number;
	if (!ReadFiniteNumber(TerrainObject, TEXT("baseHeightMeters"), Number, OutError) || FMath::Abs(Number) > 2000.0)
	{
		return Fail(OutError, TEXT("terrain.baseHeightMeters magnitude must not exceed 2000."));
	}
	Candidate.Terrain.BaseHeightMeters = Number;
	if (!ReadFiniteNumber(TerrainObject, TEXT("primaryAmplitudeMeters"), Number, OutError) || Number < 0.0 || Number > 500.0)
	{
		return Fail(OutError, TEXT("terrain.primaryAmplitudeMeters must be in [0, 500]."));
	}
	Candidate.Terrain.PrimaryAmplitudeMeters = Number;
	if (!ReadFiniteNumber(TerrainObject, TEXT("secondaryAmplitudeMeters"), Number, OutError) || Number < 0.0 || Number > 200.0)
	{
		return Fail(OutError, TEXT("terrain.secondaryAmplitudeMeters must be in [0, 200]."));
	}
	Candidate.Terrain.SecondaryAmplitudeMeters = Number;
	if (!ReadFiniteNumber(TerrainObject, TEXT("primaryFrequency"), Number, OutError) || Number <= 0.0 || Number > 1.0)
	{
		return Fail(OutError, TEXT("terrain.primaryFrequency must be in (0, 1]."));
	}
	Candidate.Terrain.PrimaryFrequency = Number;
	if (!ReadInteger(TerrainObject, TEXT("seed"), -1000000000, 1000000000, Candidate.Terrain.Seed, OutError))
	{
		return false;
	}
	if (!ReadFiniteNumber(TerrainObject, TEXT("waterLevelMeters"), Number, OutError) || FMath::Abs(Number) > 2000.0)
	{
		return Fail(OutError, TEXT("terrain.waterLevelMeters magnitude must not exceed 2000."));
	}
	Candidate.Terrain.WaterLevelMeters = Number;
	if (!ReadFiniteNumber(TerrainObject, TEXT("collisionRadiusMeters"), Number, OutError) || Number < 16.0 || Number > 5000.0)
	{
		return Fail(OutError, TEXT("terrain.collisionRadiusMeters must be in [16, 5000]."));
	}
	Candidate.Terrain.CollisionRadiusMeters = static_cast<float>(Number);
	if (!ReadColor(TerrainObject, TEXT("lowColor"), Candidate.Terrain.LowColor, OutError) ||
		!ReadColor(TerrainObject, TEXT("midColor"), Candidate.Terrain.MidColor, OutError) ||
		!ReadColor(TerrainObject, TEXT("highColor"), Candidate.Terrain.HighColor, OutError) ||
		!ReadColor(TerrainObject, TEXT("waterColor"), Candidate.Terrain.WaterColor, OutError))
	{
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* HeightSampleValues = nullptr;
	const bool bHasHeightSamples = TerrainObject->TryGetArrayField(TEXT("heightSamplesMeters"), HeightSampleValues) &&
		HeightSampleValues != nullptr;
	const int64 ExpectedHeightSamples = static_cast<int64>(Candidate.Terrain.Columns) * Candidate.Terrain.Rows;
	if (Candidate.Terrain.Authority == TEXT("sampled-source") && !bHasHeightSamples)
	{
		return Fail(OutError, TEXT("sampled-source terrain requires terrain.heightSamplesMeters."));
	}
	if (bHasHeightSamples)
	{
		if (HeightSampleValues->Num() != ExpectedHeightSamples)
		{
			return Fail(OutError, FString::Printf(
				TEXT("terrain.heightSamplesMeters must contain exactly %lld row-major values; received %d."),
				ExpectedHeightSamples,
				HeightSampleValues->Num()));
		}
		Candidate.Terrain.HeightSamplesMeters.Reserve(HeightSampleValues->Num());
		for (int32 Index = 0; Index < HeightSampleValues->Num(); ++Index)
		{
			double HeightSample = 0.0;
			if (!(*HeightSampleValues)[Index].IsValid() ||
				!(*HeightSampleValues)[Index]->TryGetNumber(HeightSample) ||
				!FMath::IsFinite(HeightSample) || FMath::Abs(HeightSample) > 2000.0)
			{
				return Fail(OutError, FString::Printf(
					TEXT("terrain.heightSamplesMeters[%d] must be finite with magnitude at most 2000."), Index));
			}
			Candidate.Terrain.HeightSamplesMeters.Add(static_cast<float>(HeightSample));
		}
	}

	const TArray<TSharedPtr<FJsonValue>>* WaterDepthValues = nullptr;
	const bool bHasWaterDepth = TerrainObject->TryGetArrayField(TEXT("waterDepthSamplesMeters"), WaterDepthValues) &&
		WaterDepthValues != nullptr;
	if (bHasWaterDepth)
	{
		if (!bHasHeightSamples)
		{
			return Fail(OutError, TEXT("terrain.waterDepthSamplesMeters requires terrain.heightSamplesMeters."));
		}
		if (WaterDepthValues->Num() != ExpectedHeightSamples)
		{
			return Fail(OutError, FString::Printf(
				TEXT("terrain.waterDepthSamplesMeters must contain exactly %lld row-major values; received %d."),
				ExpectedHeightSamples,
				WaterDepthValues->Num()));
		}
		Candidate.Terrain.WaterDepthSamplesMeters.Reserve(WaterDepthValues->Num());
		for (int32 Index = 0; Index < WaterDepthValues->Num(); ++Index)
		{
			double WaterDepth = 0.0;
			if (!(*WaterDepthValues)[Index].IsValid() ||
				!(*WaterDepthValues)[Index]->TryGetNumber(WaterDepth) ||
				!FMath::IsFinite(WaterDepth) || WaterDepth < 0.0 || WaterDepth > 1000.0)
			{
				return Fail(OutError, FString::Printf(
					TEXT("terrain.waterDepthSamplesMeters[%d] must be finite and in [0, 1000]."), Index));
			}
			Candidate.Terrain.WaterDepthSamplesMeters.Add(static_cast<float>(WaterDepth));
		}
	}

	const TArray<TSharedPtr<FJsonValue>>* ElevationValues = nullptr;
	if (!TerrainObject->TryGetArrayField(TEXT("elevationControlPoints"), ElevationValues) || ElevationValues == nullptr || ElevationValues->Num() > 256)
	{
		return Fail(OutError, TEXT("terrain.elevationControlPoints must be an array with at most 256 entries."));
	}
	for (int32 Index = 0; Index < ElevationValues->Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> PointObject = (*ElevationValues)[Index]->AsObject();
		if (!PointObject.IsValid())
		{
			return Fail(OutError, FString::Printf(TEXT("Elevation control point %d must be an object."), Index));
		}
		TArray<double> Position;
		FMousecatElevationPoint Point;
		if (!ReadVector(PointObject, TEXT("positionMeters"), 2, Position, OutError) ||
			!ReadFiniteNumber(PointObject, TEXT("radiusMeters"), Number, OutError) || Number <= 0.0 || Number > 5000.0)
		{
			return Fail(OutError, FString::Printf(TEXT("Elevation control point %d has an invalid radius."), Index));
		}
		Point.PositionMeters = FVector2D(Position[0], Position[1]);
		Point.RadiusMeters = Number;
		if (!ReadFiniteNumber(PointObject, TEXT("strengthMeters"), Number, OutError) || FMath::Abs(Number) > 1000.0)
		{
			return Fail(OutError, FString::Printf(TEXT("Elevation control point %d has invalid strength."), Index));
		}
		Point.StrengthMeters = Number;
		Candidate.Terrain.ElevationPoints.Add(Point);
	}

	const double HalfWidth = (Candidate.Terrain.Columns - 1) * Candidate.Terrain.CellSizeMeters * 0.5;
	const double HalfHeight = (Candidate.Terrain.Rows - 1) * Candidate.Terrain.CellSizeMeters * 0.5;
	if (FMath::Abs(Candidate.PlayerSpawnMeters.X) > HalfWidth || FMath::Abs(Candidate.PlayerSpawnMeters.Y) > HalfHeight)
	{
		return Fail(OutError, TEXT("world.playerSpawnMeters must be inside the terrain bounds."));
	}

	const TArray<TSharedPtr<FJsonValue>>* RegionValues = nullptr;
	if (!Root->TryGetArrayField(TEXT("regions"), RegionValues) || RegionValues == nullptr || RegionValues->IsEmpty() || RegionValues->Num() > 128)
	{
		return Fail(OutError, TEXT("regions must contain 1 to 128 entries."));
	}
	for (int32 Index = 0; Index < RegionValues->Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> RegionObject = (*RegionValues)[Index]->AsObject();
		FMousecatRegionSpec Region;
		TArray<double> Bounds;
		if (!RegionObject.IsValid() ||
			!ReadString(RegionObject, TEXT("id"), 96, Region.Id, OutError) || !IsSafeId(Region.Id) ||
			!ReadString(RegionObject, TEXT("displayName"), 128, Region.DisplayName, OutError) ||
			!ReadVector(RegionObject, TEXT("boundsMeters"), 4, Bounds, OutError) ||
			!ReadColor(RegionObject, TEXT("color"), Region.Color, OutError))
		{
			return Fail(OutError, FString::Printf(TEXT("Region %d is invalid: %s"), Index, *OutError));
		}
		Region.MinMeters = FVector2D(Bounds[0], Bounds[1]);
		Region.MaxMeters = FVector2D(Bounds[2], Bounds[3]);
		if (Region.MinMeters.X >= Region.MaxMeters.X || Region.MinMeters.Y >= Region.MaxMeters.Y ||
			Region.MinMeters.X < -HalfWidth || Region.MaxMeters.X > HalfWidth ||
			Region.MinMeters.Y < -HalfHeight || Region.MaxMeters.Y > HalfHeight)
		{
			return Fail(OutError, FString::Printf(TEXT("Region %d bounds are invalid or outside the terrain."), Index));
		}
		Candidate.Regions.Add(MoveTemp(Region));
	}

	const TArray<TSharedPtr<FJsonValue>>* LandmarkValues = nullptr;
	if (!Root->TryGetArrayField(TEXT("landmarks"), LandmarkValues) || LandmarkValues == nullptr || LandmarkValues->Num() > 512)
	{
		return Fail(OutError, TEXT("landmarks must be an array with at most 512 entries."));
	}
	for (int32 Index = 0; Index < LandmarkValues->Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> LandmarkObject = (*LandmarkValues)[Index]->AsObject();
		FMousecatLandmarkSpec Landmark;
		TArray<double> Position;
		TArray<double> Size;
		if (!LandmarkObject.IsValid() ||
			!ReadString(LandmarkObject, TEXT("id"), 96, Landmark.Id, OutError) || !IsSafeId(Landmark.Id) ||
			!ReadString(LandmarkObject, TEXT("displayName"), 128, Landmark.DisplayName, OutError) ||
			!ReadString(LandmarkObject, TEXT("kind"), 64, Landmark.Kind, OutError) ||
			!ReadVector(LandmarkObject, TEXT("positionMeters"), 2, Position, OutError) ||
			!ReadVector(LandmarkObject, TEXT("sizeMeters"), 3, Size, OutError) ||
			!ReadFiniteNumber(LandmarkObject, TEXT("yawDegrees"), Number, OutError) ||
			!ReadColor(LandmarkObject, TEXT("color"), Landmark.Color, OutError))
		{
			return Fail(OutError, FString::Printf(TEXT("Landmark %d is invalid: %s"), Index, *OutError));
		}
		Landmark.PositionMeters = FVector2D(Position[0], Position[1]);
		Landmark.SizeMeters = FVector(Size[0], Size[2], Size[1]);
		Landmark.YawDegrees = Number;
		if (FMath::Abs(Landmark.PositionMeters.X) > HalfWidth || FMath::Abs(Landmark.PositionMeters.Y) > HalfHeight ||
			Landmark.SizeMeters.X <= 0.0 || Landmark.SizeMeters.Y <= 0.0 || Landmark.SizeMeters.Z <= 0.0 ||
			Landmark.SizeMeters.GetMax() > 500.0)
		{
			return Fail(OutError, FString::Printf(TEXT("Landmark %d has invalid placement or size."), Index));
		}
		Candidate.Landmarks.Add(MoveTemp(Landmark));
	}

	const TArray<TSharedPtr<FJsonValue>>* GroveValues = nullptr;
	if (!Root->TryGetArrayField(TEXT("groves"), GroveValues) || GroveValues == nullptr || GroveValues->Num() > 64)
	{
		return Fail(OutError, TEXT("groves must be an array with at most 64 entries."));
	}
	int32 TotalTrees = 0;
	for (int32 Index = 0; Index < GroveValues->Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> GroveObject = (*GroveValues)[Index]->AsObject();
		FMousecatGroveSpec Grove;
		TArray<double> Center;
		if (!GroveObject.IsValid() ||
			!ReadString(GroveObject, TEXT("id"), 96, Grove.Id, OutError) || !IsSafeId(Grove.Id) ||
			!ReadVector(GroveObject, TEXT("centerMeters"), 2, Center, OutError) ||
			!ReadFiniteNumber(GroveObject, TEXT("radiusMeters"), Number, OutError) || Number <= 0.0 || Number > 2500.0)
		{
			return Fail(OutError, FString::Printf(TEXT("Grove %d is invalid: %s"), Index, *OutError));
		}
		Grove.CenterMeters = FVector2D(Center[0], Center[1]);
		Grove.RadiusMeters = Number;
		if (!ReadInteger(GroveObject, TEXT("count"), 0, 1000, Grove.Count, OutError) ||
			!ReadInteger(GroveObject, TEXT("seed"), -1000000000, 1000000000, Grove.Seed, OutError) ||
			!ReadColor(GroveObject, TEXT("trunkColor"), Grove.TrunkColor, OutError) ||
			!ReadColor(GroveObject, TEXT("canopyColor"), Grove.CanopyColor, OutError))
		{
			return Fail(OutError, FString::Printf(TEXT("Grove %d is invalid: %s"), Index, *OutError));
		}
		TotalTrees += Grove.Count;
		if (TotalTrees > 4096 || FMath::Abs(Grove.CenterMeters.X) + Grove.RadiusMeters > HalfWidth ||
			FMath::Abs(Grove.CenterMeters.Y) + Grove.RadiusMeters > HalfHeight)
		{
			return Fail(OutError, TEXT("Grove bounds or total tree count exceed the runtime safety budget."));
		}
		Candidate.Groves.Add(MoveTemp(Grove));
	}

	if (!ReadMappedWorld(Root, Candidate, OutError))
	{
		return false;
	}

	if (Candidate.Terrain.Authority == TEXT("sampled-source") &&
		!VerifySampledSourceReceipt(AbsolutePath, ManifestBytes, Candidate, OutError))
	{
		return false;
	}

	OutManifest = MoveTemp(Candidate);
	return true;
}
