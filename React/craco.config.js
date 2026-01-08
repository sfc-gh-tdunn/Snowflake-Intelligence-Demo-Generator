module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Fix for vega/vega-lite ESM issues
      webpackConfig.module.rules.push({
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      });
      
      return webpackConfig;
    }
  }
};

