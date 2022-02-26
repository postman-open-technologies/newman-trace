module.exports = {
  rootDir: ".",
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
};
