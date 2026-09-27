| Document | Mousecat Project Workbench |
|---|---|
| Version | Proposed contract 1 |
| Timestamp | 2026-08-16 02:54 UTC / 19:54 PST |
| Status | PRODUCT DIRECTION ACCEPTED; runtime contract proposed for implementation. |

# Mousecat Project Workbench

## Purpose

Mousecat should let an AI host and the operator work against a project's real
model even when the product's normal UI or runtime is unavailable, slow, or the
thing being authored does not exist yet.

The operator describes the intended result in conversation. A project adapter
finds the relevant source state, exposes the project's own concepts and
constraints, composes candidates or changes, and produces a representation
that can be understood directly. Mousecat keeps the source identity, authority,
freshness, permits, drafts, validation, and receipts coherent across that loop.

Colonist Awareness supplies the first concrete proof. Its offline creator can
read an exact RimWorld planet, find regional candidates, compose a connected
extent, render the surrounding landscape and arrival formation, and later
stage the selected composition into CA's current plan schema. That is not a
special map feature. It is one project adapter exercising the general
workbench.

## Product position

The workbench is the development instrument inside Mousecat's existing product
model:

```text
operator intent in conversation
        |
        v
AI host interprets the request in project terms
        |
        v
project adapter reads authoritative state and advertises valid operations
        |
        v
Mousecat binds source, permit, freshness, draft, and representation
        |
        v
operator sees and changes the actual subject at the scale judgment requires
        |
        v
adapter validates, stages, or applies through the owning project authority
        |
        v
Mousecat records the result and its source receipt
```

Conversation remains the primary control surface. A visual, model, table,
timeline, trace, comparison, or playable scene appears when the subject needs
that form. Mousecat does not turn every capability into a permanent dashboard
or force every project through one visual grammar.

## One loop, not a feature list

The workbench has six composable operations. A project adapter may support the
subset its source authority can actually perform.

| Operation | Direct meaning | State effect |
|---|---|---|
| Inspect | Resolve current project facts and constraints. | Read only. |
| Find | Search current or captured state for subjects matching stated conditions. | Read only. |
| Compose | Build a candidate from valid project concepts and constraints. | Creates an unapplied draft. |
| Represent | Produce the form needed to understand or compare the subject. | Creates a source-bound view; it does not change the project. |
| Stage | Serialize a validated draft into the project's pending or fixture surface. | Writes only to the declared staging authority. |
| Apply | Ask the owning project authority to make the staged change current. | Source write requiring both Mousecat permission and project authorization. |

These are effect classes, not UI modes. A conversational turn may cross several
operations, but every state change retains its owning operation and receipt.

## Canonical primitives

### Project adapter

A project adapter translates between Mousecat and one project's native model.
It owns no project truth. Its descriptor names:

```text
mousecat.project-adapter/1
  adapterId / namespace / revision
  projectRef / projectKind
  sourceAuthorities[]
  operationDescriptors[]:
    operationId
    effect: observe | draft | stage-write | source-write
    inputSchemaRef / outputSchemaRef
    permitRef / projectAuthorizationRef
  representationSchemaRefs[]
  validationCapabilityRef
  checkpointCapabilityRef
  connectorRef
```

Project concepts remain in project-owned schemas. Mousecat must not flatten a
RimWorld region, a UI interaction, a dependency graph, a save, and a deployment
into a generic entity graph merely because all can be represented.

Adapters execute through Mousecat's existing connector and integration
boundaries. Public Mousecat source may contain the contract and generic bridge;
private project paths, credentials, proprietary schemas, captured worlds, and
runtime state remain in project-owned or ignored local storage.

### Workbench session

A workbench session is the bounded continuity of one development inquiry:

```text
mousecat.project-workbench/1
  workbenchId / projectRef / adapterRef
  hostSessionRef / operatorRef
  intent
  sourceVector[] / freshness
  subjectRefs[]
  currentRepresentationRef
  draftRefs[] / stagedRef
  operationReceipts[]
  checkpointRef
  state: active | waiting | stale | closed
```

The session preserves what the operator was examining and which draft was
selected. It does not grant project permissions, infer understanding, or make
an unapplied draft current.

### Development representation

A representation is a decision instrument, not decoration:

```text
mousecat.development-representation/1
  representationId / workbenchId
  projectRef / subjectRefs[] / purpose
  sourceVector[] / generatedAt / freshness
  views[]:
    viewId / form / scale / artifactRef
    layerRefs[]
  layers[]:
    layerId
    meaning
    evidenceClass
    sourceRefs[] / producerRef / producerRevision
  facts[] / constraints[] / unresolved[]
  availableOperationRefs[]
  selectedDraftRef
```

`evidenceClass` is one of:

| Class | What the operator is seeing |
|---|---|
| `source-fact` | Directly captured or read from the owning source. |
| `deterministic-projection` | Reproducible output of the named current project algorithm from the bound sources. |
| `derived-summary` | A calculation or classification whose inputs and rule are named. |
| `illustration` | A depiction used to explain meaning; it is not claimed as realized project state. |
| `unknown` | The adapter cannot yet resolve the value or representation honestly. |

Exactness is declared per layer because one view may combine an exact saved
coastline, a deterministic selected boundary, a derived population summary,
and an illustrative local formation. A single global "accurate" badge would
hide the distinction.

### Draft and source receipt

A draft is a complete candidate in the project's current schema or an explicit
record of what remains unresolved. Staging and application each produce their
own receipt. An apply receipt links the Mousecat action to the owning project's
accepted, rejected, stale, or partial result. Visual success alone proves
nothing.

## Representation laws

1. **Show the subject before its metadata.** A geographic candidate is first a
   place; an interaction is first a flow; a runtime failure is first a causal
   sequence. Labels support the representation instead of standing in for it.
2. **Use the scale at which the decision exists.** A location choice may need a
   planet neighborhood, selected region, arrival ground, and settlement site.
   Mousecat links those scales rather than forcing one overloaded diagram.
3. **Keep project ownership visible.** The adapter uses the project's current
   concepts, constraints, schemas, and generation logic. Mousecat supplies the
   continuity and authority envelope.
4. **Distinguish fact, projection, summary, illustration, and absence.** A vivid
   image may not acquire authority through visual confidence.
5. **Preserve alternatives without making the operator decode them.** Candidate
   differences should be visible in the subject itself; exact comparison facts
   remain available beside the representation.
6. **Let the operator manipulate the meaningful object.** Selection, placement,
   extent, sequence, or parameters bind to project objects and serialize back
   through the adapter. Screen coordinates are never the canonical state.
7. **No dead actions.** A surfaced operation has a real adapter consumer,
   declared constraints, a permit, and a result contract.
8. **Stale work becomes visibly stale.** A changed source vector invalidates the
   affected projection or draft. Mousecat never silently promotes it.

## What this lets Mousecat support

The same loop applies wherever development has a meaningful model and an
adapter can expose it. These are examples of one capability, not separate
Mousecat products.

| Development subject | Native project model | Representation selected by the work |
|---|---|---|
| Game world, level, settlement, encounter, or colony | World/save schema, generation rules, placement constraints, runtime objects | Landscape, playable preview, spatial plan, causal summary |
| UI and interaction flow | Screens, state transitions, commands, validation, persistence | Executable flow, state map, responsive surface, interaction trace |
| Code and architecture | Modules, imports, ownership, schemas, call and event paths | Dependency structure, causal path, change impact, boundary map |
| Runtime diagnosis | Process identity, logs, events, state snapshots, build and deployment identity | Timeline, causal trace, spatial or state reconstruction |
| Test and fixture authoring | Current schemas, seeds, preconditions, expected invariants | Scenario editor, before/after comparison, coverage and receipt view |
| Data, migration, and deployment | Schemas, records, storage, services, routes, revisions | Data lineage, topology, migration preview, staged diff |

Mousecat therefore aids development by giving the operator a truthful way to
understand and author the system itself, not merely by answering questions
about files or displaying agent activity.

## Client boundary

| Surface | Responsibility |
|---|---|
| AI host conversation | Interpret intent, choose the relevant adapter operations, explain unresolved state, and continue reasoning from Mousecat receipts. |
| Mousecat service | Bind session, source vector, permits, adapter identity, representations, drafts, freshness, and receipts. |
| Host-native inline artifact | Present a focused representation when immediate spatial, visual, comparative, or causal judgment is needed. |
| Mousecat native world | Embody the same source-bound workbench inside a project realm when spatial continuity, exploration, or project progression benefits from it. |
| Existing browser operator | Continue to mediate decisions and emergency/diagnostic inspection; it does not become a universal development dashboard. |
| Project adapter | Read and change only the project surfaces its descriptor and source authority declare. |

The same representation packet may have different client projections, but
clients may not change its facts, exactness classes, available operations, or
authority.

## CA proving adapter

The Colonist Awareness adapter should expose the current offline creator as the
first end-to-end proof:

| Workbench primitive | CA implementation |
|---|---|
| Source vector | Exact RimWorld save identity and hash, planet seed/build/mod fingerprint, atlas schema, CA source/build identity |
| Inspect and find | Search saved world tiles, features, roads, rivers, biome, relief, mutators, and existing objects |
| Compose | Current CA connected regional composition, orientation, arrival, map scale, factions, settlements, and populations |
| Represent | Exact saved-world neighborhood plus the shared CA regional projection and later settlement-ground views |
| Draft | Current `CARegionalPlan` and founding-state schemas with unresolved values explicit |
| Stage | Both active pending-plan surfaces consumed by CA runtime |
| Apply | Operator-authorized project/runtime action only after current validators pass |
| Receipt | Source readback, schema round trip, exact counts and relationships, build/deployment identity, and runtime boundary |

The current landscape renderer already proves saved-world search and a more
legible candidate view. The adapter is not complete until the offline view uses
CA's production projection kernel for deterministic landing geography and the
selected draft can round-trip through the current plan schema without relying
on RimWorld's UI.

## First executable boundary

The first Mousecat implementation slice should establish the contract without
pretending every project already has an adapter:

1. Add source-owned validators for `mousecat.project-adapter/1`,
   `mousecat.project-workbench/1`, and
   `mousecat.development-representation/1`.
2. Extend the namespace-owned registry with bounded project-adapter descriptors
   that reference existing permitted connector capabilities; descriptors may
   not contain executable rendering code or local secret values.
3. Add a workbench session path that can open, snapshot, mark stale, and close a
   read-only inquiry while retaining caller-held capabilities and source
   identity.
4. Accept representation packets only from the bound adapter capability,
   validate every layer's evidence class and source references, and expose them
   to host render packets and the native world client.
5. Prove the loop with a fixture adapter and the real CA adapter in read-only
   inspect, find, compose, and represent operations.

Stage and apply follow only after the read-only path proves source invalidation,
adapter identity, representation fidelity, and client continuity. They reuse
Mousecat's existing permit and connector execution boundaries rather than
creating a second invocation system.

## Acceptance

The capability is ready for source-write work only when:

- a conversational host can open a project workbench from a current source
  vector and recover it after a short-lived host process exits;
- a project adapter can return a domain-native candidate without Mousecat
  flattening its schema;
- the operator can understand the candidate from the representation itself and
  inspect exact supporting facts without relying on labels as a substitute;
- every visual layer declares fact, deterministic projection, derived summary,
  illustration, or unknown and stale source changes invalidate it;
- two clients render the same semantic packet without changing authority;
- no arbitrary executable presentation enters through registry data;
- read-only operations cannot write, stage writes cannot become current, and
  source writes require both Mousecat permission and project authorization;
- an accepted project write returns a linked source receipt and a Mousecat
  receipt before any world or UI consequence claims success.

## Canonical impact

This direction expands Mousecat from an interaction and connector plane into a
development workbench without turning it into an IDE replacement. Mousecat
does not own the editor, compiler, engine, repository, or project ontology. It
owns the cross-host continuity and governance of working against those systems:
which source was observed, which adapter and operation acted, what the operator
saw, what remained a draft, what authority permitted a write, and what receipt
proved the result.

The contract requires a public runtime/API growth unit when implemented. Until
that unit lands, this document governs the intended feature and its acceptance
boundary; it does not make the current runtime claim support for project
adapters or workbench sessions.
