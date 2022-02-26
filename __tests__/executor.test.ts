import executor from "../src/executor";

describe("executor", () => {
  test("should run", async () => {
    const results = await executor();
    expect(results).toBeTruthy();
  });
});
