import { createYouTubeResolver } from '../src/youtube.mjs';

const resolver = createYouTubeResolver(globalThis.fetch);
const result = await resolver.lookup('https://youtube.com/@mobilelegends5v5moba?si=nMO4_CUOKa5VUi4b', {
  progress: message => console.log(message),
});
console.log(JSON.stringify(result, null, 2));
