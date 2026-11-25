/** The part of `localStorage` the app uses, so tests can pass an in-memory stand-in. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
