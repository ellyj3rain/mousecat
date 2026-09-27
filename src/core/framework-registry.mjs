import { NAMED_SKILLS, SKILL_FRAMEWORKS } from "./catalog.mjs";

const ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const ACCENTS = new Set(["neutral", "blue", "green", "rose", "amber", "cyan", "violet"]);
const INTAKE_MODES = new Set(["single-seam", "mapped-seams"]);

function error(code, details = {}) {
  return { schema: "mousecat.error/1", ok: false, code, ...details };
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifier(value) {
  const normalized = text(value)?.toLowerCase() || null;
  return normalized && ID_RE.test(normalized) ? normalized : null;
}

function presentation(raw = {}) {
  return {
    grammar: identifier(raw.grammar) || "generic",
    icon: identifier(raw.icon) || "component",
    accent: ACCENTS.has(raw.accent) ? raw.accent : "neutral",
    primitives: Array.isArray(raw.primitives)
      ? [...new Set(raw.primitives.map(identifier).filter(Boolean))].slice(0, 24)
      : [],
    motion: identifier(raw.motion) || "none",
  };
}

function sourceSkillIds() {
  return new Set(NAMED_SKILLS.map((skill) => skill.id));
}

function sourceFrameworkIds() {
  return new Set(SKILL_FRAMEWORKS.map((framework) => framework.id));
}

export function registrySnapshot(state) {
  const allCustomSkills = [...(state.customSkills || new Map()).values()];
  const allCustomFrameworks = [...(state.customFrameworks || new Map()).values()];
  const customFrameworks = allCustomFrameworks.filter((framework) => (
    identifier(framework?.id) === framework.id
    && framework.routing && typeof framework.routing === "object"
    && framework.routing.strategy === "contextual-capability-routing"
    && framework.routing.fixedTransitions === false
    && framework.routing.defaultRouter === null
    && framework.routing.recursion === "re-evaluate-framework-after-every-skill-result"
  ));
  const validFrameworkIds = new Set([...sourceFrameworkIds(), ...customFrameworks.map((framework) => framework.id)]);
  const customFrameworkById = new Map(customFrameworks.map((framework) => [framework.id, framework]));
  const customSkills = allCustomSkills.filter((skill) => (
    identifier(skill?.id) === skill.id
    && Array.isArray(skill.frameworkRefs)
    && skill.frameworkRefs.length > 0
    && skill.frameworkRefs.every((ref) => identifier(ref) === ref && validFrameworkIds.has(ref))
    && skill.frameworkRefs.every((ref) => (
      !customFrameworkById.has(ref)
      || customFrameworkById.get(ref).registration?.namespace === skill.registration?.namespace
    ))
    && skill.presentation && typeof skill.presentation === "object"
    && INTAKE_MODES.has(skill.intakeMode)
  ));
  const frameworks = [
    ...SKILL_FRAMEWORKS.map((framework) => ({
      ...framework,
      skillRefs: [
        ...(framework.skillRefs || []),
        ...customSkills.filter((skill) => skill.frameworkRefs.includes(framework.id)).map((skill) => skill.id),
      ],
    })),
    ...customFrameworks.map((framework) => ({
      ...framework,
      skillRefs: customSkills.filter((skill) => skill.frameworkRefs.includes(framework.id)).map((skill) => skill.id),
    })),
  ];
  return {
    schema: "mousecat.framework-registry/1",
    skills: [...NAMED_SKILLS, ...customSkills],
    frameworks,
    presentationPolicy: {
      executablePresentationCodeAccepted: false,
      genericFallback: true,
      accents: [...ACCENTS],
    },
    invalidDescriptors: {
      skills: allCustomSkills.length - customSkills.length,
      frameworks: allCustomFrameworks.length - customFrameworks.length,
    },
  };
}

export function resolveRegisteredSkill(state, skillRef) {
  const normalized = identifier(skillRef)?.replaceAll("_", "-") || null;
  if (!normalized) return null;
  return registrySnapshot(state).skills.find((skill) => (
    skill.id === normalized
    || skill.moduleRefs?.includes(normalized)
  )) || null;
}

export function compatibleFramework(state, fromSkillRef, toSkillRef, requestedFrameworkRef = null) {
  const from = resolveRegisteredSkill(state, fromSkillRef);
  const to = resolveRegisteredSkill(state, toSkillRef);
  if (!from || !to) return null;
  const shared = from.frameworkRefs?.filter((frameworkRef) => to.frameworkRefs?.includes(frameworkRef)) || [];
  if (requestedFrameworkRef) return shared.includes(requestedFrameworkRef) ? requestedFrameworkRef : null;
  return shared.length === 1 ? shared[0] : null;
}

export function registerFrameworkDescriptors(state, args = {}) {
  const namespace = identifier(args.namespace);
  const revision = Number.isInteger(args.revision) && args.revision > 0 ? args.revision : null;
  if (!namespace) return error("registry-namespace-required");
  if (!revision) return error("registry-revision-required");
  const frameworkInput = args.framework && typeof args.framework === "object" ? args.framework : null;
  const skillInputs = Array.isArray(args.skills) ? args.skills : [];
  if (!frameworkInput && skillInputs.length === 0) return error("registry-descriptor-required");

  let framework = null;
  if (frameworkInput) {
    const id = identifier(frameworkInput.id);
    if (!id) return error("framework-id-invalid");
    if (sourceFrameworkIds().has(id)) return error("framework-id-conflict", { frameworkId: id });
    framework = {
      id,
      label: text(frameworkInput.label) || id,
      purpose: text(frameworkInput.purpose) || "Custom contextual skill framework.",
      boundaryRefs: Array.isArray(frameworkInput.boundaryRefs)
        ? [...new Set(frameworkInput.boundaryRefs.map(identifier).filter(Boolean))]
        : ["operator-interaction"],
      routing: {
        strategy: "contextual-capability-routing",
        router: text(frameworkInput.router) || "registered-host-model-or-configured-upstream",
        defaultRouter: null,
        fixedTransitions: false,
        recursion: "re-evaluate-framework-after-every-skill-result",
      },
      source: "runtime-registry",
      registration: { namespace, revision },
    };
  }

  const knownFrameworkIds = new Set([
    ...sourceFrameworkIds(),
    ...registrySnapshot(state).frameworks.map((candidate) => candidate.id),
    ...(framework ? [framework.id] : []),
  ]);
  const knownSkillIds = sourceSkillIds();
  const skills = [];
  for (const raw of skillInputs) {
    const id = identifier(raw?.id);
    if (!id) return error("skill-id-invalid");
    if (knownSkillIds.has(id) || skills.some((skill) => skill.id === id)) return error("skill-id-conflict", { skillRef: id });
    const frameworkRefs = Array.isArray(raw.frameworkRefs)
      ? [...new Set(raw.frameworkRefs.map(identifier).filter(Boolean))]
      : framework ? [framework.id] : [];
    if (frameworkRefs.length === 0 || frameworkRefs.some((ref) => !knownFrameworkIds.has(ref))) {
      return error("skill-framework-ref-invalid", { skillRef: id, frameworkRefs });
    }
    const crossNamespace = frameworkRefs.find((ref) => {
      const registeredFramework = state.customFrameworks.get(ref);
      return registeredFramework && registeredFramework.registration?.namespace !== namespace;
    });
    if (crossNamespace) return error("skill-framework-namespace-conflict", { skillRef: id, frameworkRef: crossNamespace });
    const intakeMode = INTAKE_MODES.has(raw.intakeMode) ? raw.intakeMode : "mapped-seams";
    skills.push({
      id,
      label: text(raw.label) || id,
      role: text(raw.role) || "custom-skill",
      accepts: text(raw.accepts) || intakeMode,
      returns: text(raw.returns) || "structured-result",
      moduleRefs: Array.isArray(raw.moduleRefs) ? [...new Set(raw.moduleRefs.map(identifier).filter(Boolean))] : [],
      presentation: presentation(raw.presentation),
      invocation: "operator-interaction",
      handoff: "contextual-framework-routing",
      frameworkRefs,
      intakeMode,
      source: "runtime-registry",
      registration: { namespace, revision },
    });
  }

  const candidates = [...(framework ? [{ kind: "framework", value: framework }] : []), ...skills.map((value) => ({ kind: "skill", value }))];
  for (const candidate of candidates) {
    const collection = candidate.kind === "framework" ? state.customFrameworks : state.customSkills;
    const existing = collection.get(candidate.value.id);
    if (!existing) continue;
    if (existing.registration?.namespace !== namespace) {
      return error("registry-namespace-conflict", { id: candidate.value.id, owner: existing.registration?.namespace || null });
    }
    if (revision < existing.registration.revision) return error("registry-revision-stale", { id: candidate.value.id });
    if (revision === existing.registration.revision && JSON.stringify(existing) !== JSON.stringify(candidate.value)) {
      return error("registry-revision-conflict", { id: candidate.value.id });
    }
  }

  if (framework) state.customFrameworks.set(framework.id, framework);
  for (const skill of skills) state.customSkills.set(skill.id, skill);
  return {
    schema: "mousecat.framework-registration/1",
    ok: true,
    framework,
    skills,
    registry: registrySnapshot(state),
  };
}
