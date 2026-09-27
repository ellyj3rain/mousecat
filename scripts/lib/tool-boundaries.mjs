// Validate declared authority against the public action schema and permit catalog.
export function validateToolBoundaries(tools, boundaries, profiles) {
  const errors = [];
  const knownProfiles = new Set(profiles.map(profile => profile.id));
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  for (const tool of tools) {
    if (!boundaries.some(boundary => boundary.tool === tool.name)) {
      errors.push(`${tool.name} must have a TOOL_BOUNDARIES entry.`);
    }
  }
  for (const boundary of boundaries) {
    const tool = byName.get(boundary.tool);
    if (!tool) {
      errors.push(`${boundary.tool} boundary has no matching public tool.`);
      continue;
    }
    if (boundary.defaultPermit !== "action-specific") {
      if (!knownProfiles.has(boundary.defaultPermit)) {
        errors.push(`${boundary.tool} references unknown permit ${boundary.defaultPermit}.`);
      }
      continue;
    }
    const permits = boundary.actionPermits;
    if (!permits || typeof permits !== "object" || Array.isArray(permits)) {
      errors.push(`${boundary.tool} must declare action-specific permits.`);
      continue;
    }
    const actions = tool.inputSchema?.properties?.action?.enum || [];
    for (const action of actions) {
      if (!Object.hasOwn(permits, action)) errors.push(`${boundary.tool}:${action} has no declared permit.`);
    }
    for (const [action, permitId] of Object.entries(permits)) {
      if (!actions.includes(action)) errors.push(`${boundary.tool}:${action} is not a public action.`);
      // Only workbench operation dispatch resolves a registered adapter's permitRef.
      // Runtime additionally requires a caller capability and the operate grant.
      const adapterPermit = boundary.tool === "mousecat.workbench"
        && action === "operate" && permitId === "adapter-operation-permit";
      if (!knownProfiles.has(permitId) && permitId !== "caller-capability" && !adapterPermit) {
        errors.push(`${boundary.tool}:${action} references unknown permit ${permitId}.`);
      }
    }
  }
  return errors;
}
