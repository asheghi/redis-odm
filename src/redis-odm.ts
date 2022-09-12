import Redis from "ioredis";
import { resolve } from "path";
import { ulid } from "ulid";
import { z } from "zod";
import { createDeferred, Reject, Resolve, text } from "./lib";

const redis = new Redis();

export const model = <SchemaType>(modelName: string, schema: z.ZodTypeAny) => {
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
    static create(document?: SchemaType) {
      const instance = new Model(undefined, document);
      return this._createProxy(instance) as Model & SchemaType;
    }

    static createMany(documents: SchemaType[]) {
      return documents.map((it) => this.create(it));
    }

    static async fetchByKey(_key: string) {
      const doc = new Model(_key);
      try {
        const resString = await redis.call("JSON.GET", _key as string, ".");
        const res = JSON.parse(resString as any);
        doc._doc = res;
        return this._createProxy(doc) as Model & SchemaType;
      } catch (e) {
        console.error(e);
        throw new Error("docuemnt not found");
      }
    }
    async save() {
      await Promise.all(this.pendingActions.values());
    }
    toObject = () => ({ ...this._doc, _key: this._key });

    static async createIndex(
      indexSchema,
      { indexName = modelName + ":" + "default", drop = false } = {}
    ) {
      const args: string[] = [indexName, "ON", "JSON", "PREFIX", "1", modelName + ":", "SCHEMA"];
      Object.keys(indexSchema).forEach((key: string) => {
        const def = indexSchema[key];
        let path = key;
        if (!path.startsWith("$.")) path = "$." + path;
        const alias = def.alias || key;
        args.push(path, "as", alias, ...def.schema);
      });

      const indexList = await redis.call("FT._LIST");
      const exists = String(indexList).includes(indexName);
      console.log("schema:", ...args);

      if (exists) {
        await redis.call("FT.DROPINDEX", indexName);
      }

      await redis.call("FT.CREATE", ...args);

      const makeQuery = (queryArg?: any) => {
        const deff = createDeferred<any>();
        let _return: any[] = [];
        let _fetchDocument = true;
        let _limit = [];
        let _sortBy = [];

        const makeQueryString = () => {
          if (!queryArg) return "*";
          if (typeof queryArg === "string") return `'${queryArg}'`;
          if (typeof queryArg === "object" && !Array.isArray(queryArg)) {
            return (
              "'" +
              Object.keys(queryArg)
                .map((key) => {
                  return `@${key}:{${queryArg[key]}}`;
                })
                .join(" ") +
              "'"
            );
          }
          return "";
        };

        const handeSearchResult = (result) => {
          if (Array.isArray(result)) {
            const [count, ...documents] = result;
            const transform = documents.map((it, index, arr) => {
              if (typeof it === "string" && typeof arr[index + 1] === "object") return undefined;
              if (typeof it === "string" && _fetchDocument) {
                return this.fetchByKey(it);
              } else {
                if (_return.length === 0 && it.length === 2) {
                  let [key, content] = it;
                  if (key === "$") key = arr[index - 1];
                  const doc = new this(key, JSON.parse(content));
                  return Promise.resolve(this._createProxy(doc));
                } else {
                  return Promise.resolve(it);
                }
              }
            });
            Promise.all(transform).then((computedResult) => {
              deff.resolve(computedResult.filter((it) => it));
            });
          } else {
            deff.resolve(resolve);
          }
        };

        const execute = () => {
          const queryString: string = makeQueryString();
          const rest = [..._return, ..._sortBy, ..._limit];
          console.log("execute:", queryString, ...rest);

          redis
            .call("FT.SEARCH", indexName, queryString, ...rest)
            .then(handeSearchResult, (err) => {
              deff.reject(err);
            });
        };
        return {
          then: (onResolve: Resolve<any>, onReject: Reject) => {
            execute();
            deff.then(onResolve, onReject);
          },
          resolve: deff.resolve,
          reject: deff.reject,
          noContent() {
            _return = ["NOCONTENT"];
            return this;
          },
          noFetchDocument() {
            _fetchDocument = false;
            return this;
          },
          async count() {
            const keys = await this.noContent().noFetchDocument();
            return keys.length;
          },
          sortBy(field: string, direction: "asc" | "desc" = "asc") {
            _sortBy = ["SORTBY", field, direction.toUpperCase()];
            return this;
          },
          // todo findout how this works?!
          // as name throws error!
          select(...args: string[]) {
            // todo find out who the hell this count is calculated
            const count = 3 * args.length;
            _return = ["RETURN", count];
            args.forEach((field) => {
              _return.push("$." + field, "as", field);
            });
            return this;
          },
          limit(start: number, count: number) {
            _limit = ["LIMIT", start, count];
            return this;
          },
        };
      };

      return {
        find(query?) {
          return makeQuery(query);
        },
        findOne(query?) {
          return makeQuery(query).limit(0, 10);
        },
        rawQuery(query: string) {
          return makeQuery(query);
        },
      };
    }
  };
};
