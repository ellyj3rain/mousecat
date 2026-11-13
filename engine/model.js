/* ============================================================================
   Marshmallow Commons — SHARED INTERPRETATION ENGINE  (engine/model.js)

   The DATA-INTERPRETATION layer, lifted out of the UI so the surface and a future
   agent-facing bridge share ONE model. Pure logic over the raw pb-core status
   document: it takes the document (and the per-project record drawn from it) and
   returns the interpreted fleet model the UI renders. There is NO DOM access, NO
   rendering, NO theme/effect concern, NO event handling, NO persistence here — so a
   Node-side agent bridge can `require()`/load this exact file and get identical
   readings to what the user sees.

  The shared interpretation distinguishes observed, unknown and unverified
  project facts. The historical timeline helper remains separate from the current
  recorded-history component and does not establish real event dates.

   The IIFE attaches MCModel to globalThis (the UI imports this file for that side
   effect and reads globalThis.MCModel). The ESM export tail at the bottom exposes
   the SAME object as named + default exports so a Node agent bridge (DR-002) gets
   identical readings via `import` OR `require` (Node 24 require(esm)). The
   interpretation logic below is unchanged.
   ============================================================================ */
(function(root){
  "use strict";

  /* ----------------------------------------------------------------------------
     SMALL PURE HELPERS — shared by the model (and re-used by the UI's visual code).
     ---------------------------------------------------------------------------- */
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

  /* mulberry32 PRNG — deterministic per-seed */
  function mulberry32(seed){
    let a=seed>>>0;
    return function(){
      a|=0; a=a+0x6D2B79F5|0;
      let t=Math.imul(a^a>>>15,1|a);
      t=t+Math.imul(t^t>>>7,61|t)^t;
      return ((t^t>>>14)>>>0)/4294967296;
    };
  }
  /* string -> 32-bit seed (so a project keeps its gradient across reloads) */
  function hashSeed(str){
    let h=2166136261>>>0;
    for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
    return h>>>0;
  }

  /* ---- health rollup (loss-risk first) — single tunable source of truth ---- */
  const LOSS = {
    "zero-commit":{health:"risk", word:"No commits yet — work not saved at all"},
    "dirty-heavy":{health:"risk", word:"Many uncommitted changes at risk"},
    "no-remote":  {health:"attention", word:"No Git remote configured"},
    "none":       {health:"ok", word:"No high-risk condition reported"},
    "unknown":    {health:"neutral", word:"Some project safety facts were not observed"},
    "not-git":    {health:"neutral", word:"Not version-controlled"}
  };
  const HEALTH_RANK = {risk:0, attention:1, neutral:2, ok:3};

  function rollupHealth(p, doc){
    // loss-risk drives the headline
    const lossKey = p.isRepo && p.lossRisk === "none" && (p.remoteStanding !== "configured-unverified" || !Number.isSafeInteger(p.dirty) || p.dirty < 0) ? "unknown" : p.lossRisk;
    const base = LOSS[lossKey] || LOSS["unknown"];
    let health = base.health, reason = base.word, driver = "version control";
    const reasons = [reason];

    // dirty-heavy / zero-commit reason gets the concrete count
    if(p.lossRisk==="dirty-heavy") reason = `${p.dirty} changed files, at risk of loss`;
    if(p.lossRisk==="zero-commit") reason = `No commits${p.branch ? ` on "${p.branch}"` : " yet"}${p.dirty == null ? "" : ` · ${p.dirty} changed files`}`;
    if(p.lossRisk==="no-remote") reason = `${p.dirty>0?p.dirty+" changed files · ":""}no Git remote configured`;
    if(lossKey==="none") reason = p.dirty > 0 ? `${p.dirty} changed file${p.dirty===1?"":"s"} · remote copy unverified` : "No changed files observed · remote copy unverified";
    if(Number.isSafeInteger(p.ahead) && p.ahead > 0 && HEALTH_RANK["attention"] < HEALTH_RANK[health]){
      health="attention"; driver="tracking";
      reason=`${p.ahead} commit${p.ahead===1?"":"s"} ahead of the local tracking reference${p.dirty>0?` · ${p.dirty} changed files`:""}`;
    }

    // version drift -> at least attention
    if(p.drift && p.drift.inSync===false){
      if(HEALTH_RANK["attention"]<HEALTH_RANK[health]){ health="attention"; reason="Version markers disagree"; driver="drift"; }
    }
    // a present secret at warn -> attention (none in sample are present+warn, but honor the rule)
    if(doc && Array.isArray(doc.secrets)){
      for(const s of doc.secrets){
        if(s.present && s.severity==="warn" && HEALTH_RANK["attention"]<HEALTH_RANK[health]){ health="attention"; reason="Exposed credential present"; driver="hygiene"; }
        if(s.present && s.severity==="critical"){ health="risk"; reason="Exposed credential (critical)"; driver="hygiene"; }
      }
    }
    return { health, reason, driver, baseWord:base.word };
  }

  /* Qualitative work-safety dimensions. Numeric fill is presentation, not proof. */
  function safetyMeter(p){
    const tracked = p.isRepo ? 1 : 0;
    // A missing count cannot become a clean-worktree claim.
    const savedUnknown = !p.isRepo || !Number.isSafeInteger(p.dirty) || p.dirty < 0;
    const saved = p.lossRisk==="zero-commit" ? 0 : savedUnknown ? 0 : p.dirty === 0 ? 1 : 0.4;
    const remoteUnknown = !p.isRepo || !["configured-unverified", "no-remote-observed"].includes(p.remoteStanding);
    const remote = p.isRepo && p.remoteStanding === "configured-unverified";
    const remotesObserved = p.isRepo && Array.isArray(p.remotes) && p.remotes.every(value => typeof value === "string");
    const remoteUnknownText = !remotesObserved ? "Remote configuration not observed"
      : `${p.remotes.length ? p.remotes.join(", ") + " observed" : "No Git remote observed"}; ${p.remoteEvaluation === "unavailable" ? "remote evaluation unavailable" : "remote standing unavailable"}`;
    const versionUnknown = !p.drift || typeof p.drift.inSync !== "boolean";
    const clean = versionUnknown ? 0 : p.drift.inSync ? 1 : 0.4;
    return [
      {key:"tracked", label:"Tracked",   level:tracked, ok:tracked>=1,  plain:tracked?"Under version control":"Not version-controlled"},
      {key:"saved",   label:"Committed", level:saved, ok:!savedUnknown && p.lossRisk!=="zero-commit" && p.dirty===0, unknown:savedUnknown, plain:p.lossRisk==="zero-commit"?"No commit yet":savedUnknown?"Changed files not observed":p.dirty?`${p.dirty} uncommitted change${p.dirty===1?"":"s"}`:"No uncommitted changes observed"},
      {key:"backed", label:"Remote", level:remote?1:0, ok:remote, unknown:remoteUnknown, plain:remoteUnknown?remoteUnknownText:remote?`${Array.isArray(p.remotes) ? p.remotes.join(", ") : "Remote"} configured; remote copy not verified`:"No Git remote configured; other backups not assessed"},
      {key:"clean", label:"Versions", level:clean, ok:!versionUnknown && p.drift.inSync, unknown:versionUnknown, plain:versionUnknown?"Version consistency not observed":p.drift.inSync?"Version markers agree":"Version markers disagree"}
    ];
  }

  function projectShortName(p){
    const map={"gz-development-system":"GZ Development System","otl":"OTL","devise":"Devise",
      "neo-jetbrains":"neo (JetBrains)","GZS-WebDev":"GZS WebDev","Cymelicra":"Cymelicra",
      "the-lizard-lot":"The Lizard Lot","NEO":"NEO (prototype)","Matrice":"Matrice",
      "oss-skills-pack":"OSS Skills Pack","mod-platform":"Mod Platform"};
    return map[p.id]||p.id;
  }
  function projectKind(p){
    if(!p.isRepo)return "not a git repo";
    return `${p.branch||"—"} · ${!Array.isArray(p.remotes)?"remotes unknown":p.remotes.length?p.remotes.length+" remote"+(p.remotes.length>1?"s":""):"no remote"}`;
  }

  /* ----------------------------------------------------------------------------
     TIMELINE MODEL — assemble a project's commits/decisions/releases as dated
     points, detect quiet-spell gaps, lay them on a horizontal rhythm rail.
     The lean pb-core contract carries only lastCommit + governance; we build an
     honest, deterministic-per-project history scaffold around the real anchors so
     the rhythm + quiet spells are legible, and every point opens to a real entry.

     Takes the status `doc` explicitly (for generatedAt + governance) so it stays
     pure — no global app state. The UI passes its current document in.
     ---------------------------------------------------------------------------- */
  function buildTimelineEvents(p, doc){
    const ev=[];
    const now = doc && doc.generatedAt ? new Date(doc.generatedAt).getTime() : Date.now();
    const DAY=86400000;
    const gov=doc&&doc.governance||{};

    // honest empty story for a zero-commit project
    if(p.lossRisk==="zero-commit" || (p.isRepo && !p.lastCommit && !(p.drift&&p.drift.versionFile))){
      return {events:[], empty:true, emptyKind:"zero-commit"};
    }
    if(!p.isRepo){ return {events:[], empty:true, emptyKind:"not-git"}; }

    // the real anchor: last commit (a release-grade point if it carries a batch tag)
    if(p.lastCommit){
      const m=p.lastCommit.match(/\[([AB]\d+(?:\.\d+)*|DR-\d+|[A-Z]\d+)\]/);
      ev.push({ kind:m?"release":"commit", at:now, synthetic:false,
        title: p.lastCommit.split(" ").slice(1).join(" ").replace(/\s*\[[^\]]+\]\s*$/,"").trim() || p.lastCommit,
        tag: m?m[1]:p.lastCommit.split(" ")[0].slice(0,7),
        summary:"Most recent recorded change on "+(p.branch||"this branch")+" — a real anchor from the live data.",
        raw:{hash:p.lastCommit.split(" ")[0], message:p.lastCommit.split(" ").slice(1).join(" "), branch:p.branch, source:"recorded (lastCommit)"} });
    }

    // version trajectory from drift markers -> synthetic release points back in time
    const ver = p.drift && p.drift.versionFile;
    if(ver && /^\d+\.\d+/.test(ver)){
      const rng=mulberry32(hashSeed(p.id+":story"));
      const parts=ver.split(".").map(Number);
      const releases=clamp((parts[0]*3 + parts[1] + 2), 3, 9);
      let cursor=now;
      for(let i=1;i<=releases;i++){
        // walk back with an intentionally irregular cadence so quiet spells emerge
        const gapDays = Math.round(2 + rng()*((i%3===0)?46:14));
        cursor -= gapDays*DAY;
        const minor=Math.max(0,(parts[1]||0)-i);
        const isDecision = rng()>0.62;
        ev.push({
          kind: isDecision?"decision":"release", at:cursor, synthetic:true,
          title: isDecision ? ("Decision recorded — "+(gov.latestDR?gov.latestDR.replace(/-\d+$/,"-"+(Number((gov.latestDR.match(/\d+/)||[100])[0])-i)) : ("DR-"+(120-i)))) : ("Shipped "+parts[0]+"."+minor+".0"),
          tag: isDecision ? (gov.latestDR?gov.latestDR.replace(/-\d+$/,"-"+(Number((gov.latestDR.match(/\d+/)||[100])[0])-i)) : ("DR-"+(120-i))) : ("v"+parts[0]+"."+minor),
          summary: isDecision ? "Reconstructed from the version trajectory — a plausible decision point, NOT a recorded log entry." : "Reconstructed from the version trajectory — a plausible release point, NOT a recorded shipment.",
          raw: isDecision ? {type:"decision", source:"reconstructed from version trajectory", note:"This point is inferred from the project's version number, not read from a recorded decision log."} : {type:"release", version:parts[0]+"."+minor+".0", source:"reconstructed from version trajectory", note:"This point is inferred from the project's version number, not a recorded release."}
        });
      }
    }
    // governance batch/DR as the freshest decision anchors (real fields)
    if(gov.latestBatch){ ev.push({kind:"release", at:now-2*DAY, synthetic:false, title:"Latest batch shipped", tag:gov.latestBatch.replace(/[\[\]]/g,""), summary:"The most recent numbered shipment in governance — a real anchor from the live data.", raw:{batch:gov.latestBatch, source:"recorded (governance.latestBatch)"}}); }
    if(gov.latestDR){ ev.push({kind:"decision", at:now-1*DAY, synthetic:false, title:"Latest decision recorded", tag:gov.latestDR, summary:"The most recent ratified decision in governance — a real anchor from the live data.", raw:{decision:gov.latestDR, source:"recorded (governance.latestDR)"}}); }

    ev.sort((a,b)=>a.at-b.at);
    // detect quiet spells (gaps > 21 days) between consecutive events
    const gaps=[];
    for(let i=1;i<ev.length;i++){
      const days=Math.round((ev[i].at-ev[i-1].at)/DAY);
      if(days>=21) gaps.push({afterIdx:i-1, beforeIdx:i, days});
    }
    return {events:ev, gaps, empty:ev.length===0, span:{from:ev[0]?.at, to:ev[ev.length-1]?.at}};
  }

  /* portrait health dimensions -> ring values (loss-risk-first, visual) */
  function portraitDimensions(p){
    const sm=safetyMeter(p);
    const byKey=Object.fromEntries(sm.map(s=>[s.key,s]));
    return [
      {key:"tracked", label:"Tracked",  value:byKey.tracked.level, color: byKey.tracked.ok?"--state-passed":"--state-warning", num: byKey.tracked.ok?"yes":"no"},
      {key:"saved", label:byKey.saved.label, value:byKey.saved.level, color:byKey.saved.unknown?"--text-tertiary":byKey.saved.ok?"--state-passed":"--state-warning", num:byKey.saved.unknown?"unknown":p.lossRisk==="zero-commit"?"no commit":p.dirty+" left"},
      {key:"backed", label:byKey.backed.label, value:byKey.backed.level, color:byKey.backed.unknown?"--text-tertiary":byKey.backed.ok?"--state-passed":"--state-warning", num:byKey.backed.unknown?"unknown":Array.isArray(p.remotes)?p.remotes.length+"":"unknown"},
      {key:"clean", label:byKey.clean.label, value:byKey.clean.level, color:byKey.clean.unknown?"--text-tertiary":byKey.clean.ok?"--state-passed":"--state-warning", num:byKey.clean.unknown?"unknown":byKey.clean.ok?"in sync":"drift"}
    ];
  }

  /* health-as-gauge value: ok=high, attention=mid, risk=low, neutral=mid-low */
  function gaugeValue(health){
    return ({ok:0.92, attention:0.5, neutral:0.3, risk:0.12})[health] ?? 0.5;
  }

  /* ----------------------------------------------------------------------------
     ATTENTION SIGNALS — every attention-worthy signal interpreted from the
     document (projects at risk/attention + services down or stale). Pure: it takes
     the document and returns the full signal list. Snooze filtering is an app-state
     concern and stays in the UI (which filters this list).
     ---------------------------------------------------------------------------- */
  function attentionSignals(doc){
    if(!doc) return [];
    const items=[];
    for(const p of doc.projects){
      const h=rollupHealth(p,doc);
      if(h.health==="risk"||h.health==="attention"){
        items.push({id:p.id, project:p, name:projectShortName(p), health:h.health, text:h.reason, kind:"project"});
      }
    }
    // services down / stale
    for(const s of doc.services){
      if(s.id==="pb-core")continue;
      if(s.lockfileStale && s.pidAlive===false){
        items.push({id:"svc:"+s.id, name:s.id, health:"attention", text:`lockfile stale (pid ${s.pid} not alive)`, kind:"service"});
      }
    }
    // expected-up-but-unreachable, surfaced from collector notes
    const svcFam=(doc.families||[]).find(f=>f.family==="services");
    if(svcFam && Array.isArray(svcFam.notes)){
      for(const note of svcFam.notes){
        const m=note.match(/services:\s*([\w-]+)\s+expected up.*unreachable/i);
        if(m && !items.some(i=>i.id==="svc:"+m[1])) items.push({id:"svc:"+m[1], name:m[1], health:"attention", text:"expected up but unreachable", kind:"service"});
      }
    }
    items.sort((a,b)=> (a.health==="risk"?0:1)-(b.health==="risk"?0:1));
    return items;
  }

  /* ----------------------------------------------------------------------------
     FRESHNESS — derive staleness from a family's observedAt + ttlSeconds against
     now. Pure (now is injectable for determinism / testing). The UI keeps its own
     display-string formatting; this is the model-side interpretation of whether an
     observation is still within its TTL and by how much.
     ---------------------------------------------------------------------------- */
  function freshness(family, now){
    if(!family || !family.observedAt) return {ageSeconds:null, ttlSeconds:null, stale:null};
    const nowMs = (now==null ? Date.now() : now);
    const ageMs = nowMs - new Date(family.observedAt).getTime();
    const ageSeconds = isNaN(ageMs) ? null : Math.round(ageMs/1000);
    const ttlSeconds = (typeof family.ttlSeconds==="number") ? family.ttlSeconds : null;
    const stale = (ageSeconds!=null && ttlSeconds!=null) ? (ageSeconds > ttlSeconds) : null;
    return {ageSeconds, ttlSeconds, stale};
  }

  /* fleet summary — count projects by health enum */
  function fleetSummary(doc){
    if(!doc || !Array.isArray(doc.projects)) return {risk:0, attention:0, neutral:0, ok:0, total:0};
    const counts = {risk:0, attention:0, neutral:0, ok:0};
    for(const p of doc.projects){
      const h = rollupHealth(p, doc);
      counts[h.health] = (counts[h.health] || 0) + 1;
    }
    return { ...counts, total: doc.projects.length };
  }

  /* ----------------------------------------------------------------------------
     PUBLIC SURFACE — the single global the UI (and a future bridge) consume.
     ---------------------------------------------------------------------------- */
  const MCModel = {
    // shared pure helpers
    clamp, mulberry32, hashSeed,
    // interpretation tables
    LOSS, HEALTH_RANK,
    // status-document -> model
    rollupHealth,
    safetyMeter,
    projectShortName,
    projectKind,
    buildTimelineEvents,
    portraitDimensions,
    gaugeValue,
    attentionSignals,
    freshness,
    fleetSummary
  };

  root.MCModel = MCModel;
  if(typeof module!=="undefined" && module.exports){ module.exports = MCModel; }
})(typeof globalThis!=="undefined" ? globalThis : (typeof window!=="undefined" ? window : this));

/* ---- ESM/CJS interop (DR-002 bridge contract). The IIFE above attaches MCModel to
   globalThis AND, in Node, to module.exports — so a CLASSIC <script> (the standalone
   app over file:// or a plain static server) and a CommonJS require both get the real
   API with zero build step. The ESM `export` surface lives in the SIBLING model.mjs,
   NOT here: an `export` in this file is a SyntaxError that kills the entire file in any
   non-module load, leaving globalThis.MCModel unset and the app blank. ESM consumers
   import "./model.mjs" (which re-exports the same MCModel this IIFE sets). */
