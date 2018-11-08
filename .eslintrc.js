module.exports = {
  extends: "standard",
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'comma-dangle': ['warn', 'only-multiline'],
    'camelcase': ['warn', {
      'ignoreDestructuring': true,
      "properties": 'never',
    }],
  },
}
