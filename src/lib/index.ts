export type Resolve<T> = (v: T) => void;
export type Reject = (e: Error) => void;

export interface IDeferred<T> {
  resolve: Resolve<T>;
  reject: Reject;
  then(onResolved: Resolve<T>, onRejected: Reject): Promise<unknown>;
}

export function createDeferred<T = void>(): IDeferred<T> {
  let resolve: Resolve<T> | undefined, reject: Reject | undefined;

  const promise = new Promise<T>((...args) => ([resolve, reject] = args));

  return Object.freeze(<IDeferred<T>>{
    resolve: resolve!,
    reject: reject!,
    then: (...args) => promise.then(...args),
  });
}

export const text = (alias?: string) => {
  return {
    schema: ["TEXT"],
    alias,
    buildSchema() {
      return this.schema;
    },
    sortable() {
      this.schema.push("SORTABLE");
      return this;
    },
    noIndex() {
      this.schema.push("NOINDEX");
      return this;
    },
  };
};

export const string = (alias?: string) => {
  return {
    schema: ["TAG"],
    alias,
    buildSchema() {
      return this.schema;
    },
    noIndex() {
      this.schema.push("NOINDEX");
      return this;
    },
  };
};

export const number = (alias?: string) => {
  return {
    schema: ["NUMERIC"],
    alias,
    buildSchema() {
      return this.schema;
    },
    noIndex() {
      this.schema.push("NOINDEX");
      return this;
    },
  };
};

export const boolean = (alias?: string) => {
  return {
    schema: ["TAG"],
    alias,
    buildSchema() {
      return this.schema;
    },
    noIndex() {
      this.schema.push("NOINDEX");
      return this;
    },
  };
};

const date = (alias?: string) => {
  return {
    schema: ["NUMERIC"],
    alias,
    buildSchema() {
      return this.schema;
    },
    noIndex() {
      this.schema.push("NOINDEX");
      return this;
    },
  };
};

export const IndexSchema = { date, boolean, text, string, number };