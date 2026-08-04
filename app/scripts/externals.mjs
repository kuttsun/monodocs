// Packages esbuild keeps out of the CLI bundle.
//
// The code still imports them at run time, so they have to reach users some other way: the
// published npm package declares them, and `npm install monodocs` pulls them in. Both ends of
// that arrangement read this list — scripts/bundle.mjs to mark them external, scripts/pack.mjs
// to declare them in the generated manifest — so a package cannot be dropped from the bundle
// without also being published.
export const bundleExternals = ["puppeteer-core"];
