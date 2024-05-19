
import { reactive } from 'vue';

export enum RngMode {
  random = 'random',
  set = 'set',
  none = 'none',
};

const initialStateObj = {
  rng: {
    inject: false,
    mode: RngMode.random,
    seed: '',
    joker: '',
    anim: ''
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