/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig
// module.exports = {
//     output: 'standalone'
//   }

//   /** @type {import('next').NextConfig} */
// const nextConfig = {
//     webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
//       config.plugins.push(
//         new webpack.DefinePlugin({
//           'process.env.FLUENTFFMPEG_COV': false
//       })
//       )
   
//       return config
//     },
//     images: {
//       remotePatterns: [
//         {
//           protocol: 'https',
//           hostname: '*',
//           port: '',
//           pathname: '/**',
//         },
//       ],
//     },
//   }
  
//   module.exports = nextConfig