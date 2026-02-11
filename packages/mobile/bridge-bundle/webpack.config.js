const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./tongo-bridge.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bridge.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    },
    fallback: {
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      http: false,
      https: false,
      zlib: false,
      url: false,
      buffer: require.resolve("buffer/"),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx|mjs)$/,
        exclude: /node_modules\/(?!(@fatsolutions)\/).*/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-typescript"],
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new webpack.NormalModuleReplacementPlugin(/^node:(.*)$/, (resource) => {
      resource.request = resource.request.replace(/^node:/, "");
    }),
    new HtmlWebpackPlugin({
      templateContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><script>window.onerror=function(m,s,l,c,e){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:m,stack:e&&e.stack}))}</script></body>
</html>`,
      inject: "body",
    }),
  ],
};
