import { model } from "../src/redis-odm";
import { z } from "zod";
import Redis from "ioredis";
import { IndexSchema } from "../src/lib";

const A_TITLE = "awesome titiel";
const A_TEXT = "awesome post!";
/**
 * Redis ODM
 */
describe("Reids-ODM", () => {
  const redis = new Redis();
  beforeEach(async () => {
    await redis.flushall();
    await redis.flushdb();
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.disconnect();
  });

  it("Demo basic", async () => {
    const PostSchema = z.object({
      title: z.string(),
      content: z.string().optional(),
      views: z.number().optional(),
    });
    type PostType = z.infer<typeof PostSchema>;

    const Post = model<PostType>("post", PostSchema);
    const post = Post.create({
      title: A_TITLE,
    });
    post.content = A_TEXT;
    post.views = 1;
    post.views++;

    expect(post._key).toBeTruthy();
    expect(post.title).toBe(A_TITLE);
    expect(post.content).toBe(A_TEXT);
    expect(post.views).toBe(2);

    await post.save();

    //after save
    expect(post._key).toBeTruthy();
    expect(post.title).toBe(A_TITLE);
    expect(post.content).toBe(A_TEXT);
    expect(post.views).toBe(2);

    const fetched = await Post.fetchByKey(post._key);
    expect(fetched._key).toBeTruthy();
    expect(fetched.title).toBe(A_TITLE);
    expect(fetched.content).toBe(A_TEXT);
    expect(fetched.views).toBe(2);
    expect(fetched.toObject()).toEqual({
      _key: post._key,
      title: A_TITLE,
      content: A_TEXT,
      views: 2,
    });
  });

  it("demo index", async () => {
    const UserSchema = z.object({
      username: z.string(),
      email: z.string(),
      createdAt: z.number().optional(),
    });

    type UserSchema = z.infer<typeof UserSchema>;
    const User = model<UserSchema>("accounts", UserSchema);

    const UserIndex = await User.createIndex(
      {
        createdAt: IndexSchema.number().sortable(),
      },
      //drop if you have existing index and your schema has changed
      { drop: true, indexName: "lalalala" }
    );

    await User.create({ username: "first", email: "first@mail.com", createdAt: 0 }).save();
    await User.create({ username: "second", email: "second@mail.com", createdAt: 1 }).save();
    await User.create({ username: "third", email: "third@mail.com", createdAt: 2 }).save();

    const count = await UserIndex.find().count();
    expect(count).toBe(3);

    const limited = await UserIndex.find().limit(0, 1);
    expect(limited.length).toBe(1);

    // todo fix sortby
    const sort1 = await UserIndex.find().sortBy("createdAt", "desc");
    const sort2 = await UserIndex.find().sortBy("createdAt", "desc");
    const sort3 = await UserIndex.find().sortBy("createdAt", "desc");

    expect(sort1).toEqual(sort2);
    expect(sort2).toEqual(sort3);

    const resultOfRaw = await UserIndex.rawQuery("*");
    expect(resultOfRaw.length).toBe(3);
  });

  it("demo sortby and select", async () => {
    const ModelSchema = z.object({
      age: z.number(),
      name: z.string(),
    });
    type ModelType = z.infer<typeof ModelSchema>;
    const Model = model<ModelType>("model", ModelSchema);

    const Index = await Model.createIndex({
      age: IndexSchema.number().sortable(),
    });

    await Model.create({ age: 72, name: "granny" });
    await Model.create({ age: 35, name: "mommy" });
    await Model.create({ age: 25, name: "daddy" });
    await Model.create({ age: 5, name: "baby" });

    let names = await Index.find().sortBy("age").select("name");
    names = names.map(([key, value]) => value);
    expect(names).toEqual(["baby", "daddy", "mommy", "granny"]);
    /*     names.forEach((name) => {
      console.log(name, "shark do do dodo do do");
    }); */
  });

  it("array", async () => {
    const ModelSchema = z.object({
      arr: z.array(z.any()),
    });
    type ModelType = z.infer<typeof ModelSchema>;
    const Model = model<ModelType>("model", ModelSchema);
    const document = Model.create();
    document.arr = [];
    document.arr.push("test");
    await document.save();

    const fetched = await Model.fetchByKey(document._key);
    expect(fetched.arr).toEqual(["test"]);
  });

  it("nested object/arrays works!", async () => {
    const UserSchema = z.object({
      name: z.string(),
      email: z.string(),
      nested: z.object({
        roles: z.array(z.string()),
      }),
    });
    type UserType = z.infer<typeof UserSchema>;
    const User = model<UserType>("user", UserSchema);
    const user = User.create({
      name: "bahman",
      email: "aheghi.bm@gmail.com",
      nested: { roles: [] },
    });
    user.nested.roles.push("admin");
    await user.save();

    expect(user.nested.roles).toEqual(["admin"]);
    user.nested.roles.splice(0, user.nested.roles.length);

    expect(user.nested.roles).toEqual([]);
    user.nested.roles.push("support");
    expect(user.nested.roles).toEqual(["support"]);

    await user.save();
    expect(user.nested.roles).toEqual(["support"]);

    const fetched = await User.fetchByKey(user._key);
    expect(fetched.nested.roles).toEqual(["support"]);
  });
});
