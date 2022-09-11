// 👇️ ts-nocheck ignores all ts errors in the file
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import Redis from "ioredis";
import { ulid } from "ulid";
const redis = new Redis();

export const model = <Schema>(modelName: string) => {
  return class Model {
    _key: string;
    _doc: any;
    pendingActions: Map<string, Promise<any>> = new Map();
    private constructor(_key?: string, document: any = {}) {
      const hadKey = _key;
      this._key = _key ?? modelName + ":" + ulid();
      this._doc = document;

      if (!hadKey) {
        const createPromise = redis.call(
          "JSON.SET",
          this._key,
          "$",
          // ts-ignore
          document ? JSON.stringify(document) : "{}"
        );
        this.appendPendingAction(createPromise);
      }
    }

    appendPendingAction(promise: Promise<any>) {
      const actionId = ulid();
      this.pendingActions.set(actionId, promise);
      promise.then(() => {
        this.pendingActions.delete(actionId);
      });
    }

    static _createProxy(instance: any) {
      const handler: ProxyHandler<Model> = {
        set(target, field: string, value, receiver) {
          instance._doc[field] = value;

          instance.appendPendingAction(
            redis.call("JSON.SET", instance._key as any, "$." + field, JSON.stringify(value))
          );
          return true;
        },
        get(target, field: string, receiver) {
          if (instance._doc[field]) {
            const value = instance._doc[field];
            if (value && typeof value === "object") {
              const nestedHandler: (nestedPath: string[]) => ProxyHandler<typeof value> = (
                nestedPath
              ) => {
                return {
                  set(t, f: string, v, r) {
                    Reflect.set(t, f, v, r);

                    if (Array.isArray(t)) {
                      // todo make it happen only once!
                      instance.appendPendingAction(
                        redis.call(
                          "JSON.SET",
                          instance._key,
                          "." + [field, ...nestedPath].join("."),
                          JSON.stringify(t)
                        )
                      );
                    } else {
                      instance.appendPendingAction(
                        redis.call(
                          "JSON.SET",
                          instance._key,
                          "." + [field, ...nestedPath, f].join("."),
                          JSON.stringify(v)
                        )
                      );
                    }
                    return true;
                  },
                  get(t, p, r) {
                    if (typeof p === "symbol") return t[p];
                    if (typeof t[p] === "object") {
                      return new Proxy(t[p], nestedHandler([...nestedPath, p]));
                    }

                    return t[p];
                  },
                };
              };
              return new Proxy(value, nestedHandler([]));
            }
            return value;
          }
          if (field in instance) {
            return instance[field];
          }
          return undefined;
        },
      };
      return new Proxy(instance, handler);
    }
    static create(document?: Schema) {
      const instance = new Model(undefined, document);
      return this._createProxy(instance) as Model & Schema;
    }

    static async findByKey(_key: string) {
      const doc = new Model(_key);
      try {
        const resString = await redis.call("JSON.GET", _key as string, ".");
        const res = JSON.parse(resString as any);
        doc._doc = res;
        return this._createProxy(doc) as Model & Schema;
      } catch (e) {
        console.error(e);
        throw new Error("docuemnt not found");
      }
    }
    async save() {
      await Promise.all(this.pendingActions.values());
    }
    toObject = () => ({ ...this._doc, _key: this._key });
  };
};
