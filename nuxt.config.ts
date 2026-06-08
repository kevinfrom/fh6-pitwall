export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      fh6UdpPort: '' // NUXT_PUBLIC_FH6_UDP_PORT
    }
  }
})
