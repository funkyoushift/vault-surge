export interface CompanionState {
  sessionActive: boolean;
  paused: boolean;
}

const state: CompanionState = {
  sessionActive: process.env.VAULT_SURGE_LOCAL_SESSION_ACTIVE === "true",
  paused: false,
};

export function getCompanionState(): CompanionState {
  return { ...state };
}

export function setSessionActive(sessionActive: boolean): CompanionState {
  state.sessionActive = sessionActive;
  if (!sessionActive) state.paused = false;
  return getCompanionState();
}

export function setPaused(paused: boolean): CompanionState {
  if (!state.sessionActive && paused) throw new Error("Start the session before pausing effects.");
  state.paused = paused;
  return getCompanionState();
}
