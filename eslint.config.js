module.exports = [
  {
      rules: {
          semi: "warn",
          // "prefer-const": "error"
      }      
  },
  {
    ignores: [
        "dist/**/*",        // ignore all contents in and under `build/` directory but not the `build/` directory itself
        
    ]
}
];