module.exports = {
  devServer: {
    allowedHosts: 'all',
    host: 'localhost',
    port: 3005,
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Fix for webpack-dev-server allowedHosts issue
      if (webpackConfig.devServer) {
        webpackConfig.devServer.allowedHosts = 'all';
      }
      return webpackConfig;
    },
  },
}; 