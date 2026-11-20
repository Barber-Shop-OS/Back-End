// BE-42: contexto por requisição (request_id) via AsyncLocalStorage — o logger inclui o id em todo
// log emitido durante a requisição, sem precisar passá-lo de função em função.
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const run = (context, fn) => storage.run(context, fn);
const get = () => storage.getStore() || null;
const requestId = () => {
  const context = get();
  return context ? context.requestId : undefined;
};

module.exports = { run, get, requestId };
