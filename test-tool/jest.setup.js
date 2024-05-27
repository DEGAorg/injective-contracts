global.console = {
  log: jest.fn(), // mock the console.log function
  // Keep other console methods if necessary
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};
