export {
  burgerDashGameDefinition,
  getBurgerDashAIMove,
  BURGERDASH_DIFFICULTY_PROFILE,
  loadBurgerDashState,
  saveBurgerDashState,
  burgerDashApplyAction,
  projectBurgerDashState,
} from "./definition";

export type {
  BurgerDashState,
  BdPlayer,
  Hand,
  Phase,
  Space,
  SpaceKind,
  SpaceEffect,
  ColorKey,
  ArtKey,
  BdStatus,
} from "./types";

export {
  createInitialState,
  cloneState,
  chooseHider,
  hideHand,
  guessHand,
  resolveSpace,
  continueEffect,
  skipStalledTurn,
  resign,
  activePlayer,
  playerById,
  actorForPhase,
  getLegalActions,
  buildMovePath,
  PLAYER_COLORS,
} from "./rules";
export type { PlayerConfig } from "./rules";

export { BOARD, FINAL_SPACE, GRID_COLS, GRID_ROWS, getSpace } from "./board";

export {
  BURGERDASH_HELP_TITLE,
  BURGERDASH_HELP_CONTENT,
  HELP_REGISTRY,
} from "./help-content";
