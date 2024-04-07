
import { reactive } from 'vue';

export enum RngMode {
  random = 'random',
  set = 'set',
};

const initialStateObj = {
  fps: {
    field: {
      value: 100,
      auto: false,
    },
    world: {
      value: 100,
      auto: false,
    },
    battle: {
      value: 100,
      auto: false,
    },
  },
  tweaks: {
    battleSwirlFpsCap: false,
    menusFpsCap: false,
    disablePauseWhenUnfocused: false,
  },
  rng: {
    inject: false,
    mode: RngMode.random,
    seed: ''
  },
  driver: {
    installed: false,
    gamePath: null as string | null,
  },
  app: {
    connected: false
  }
};

export type State = typeof initialStateObj;

export const state = reactive(initialStateObj);