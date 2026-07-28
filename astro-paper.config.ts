import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://xuehaonan27.github.io/",
    title: "xuehaonan27's blog",
    description:
      "Xue Haonan's personal blog about systems, HPC, JVM and other fun stuff.",
    author: "Xue Haonan",
    profile: "https://github.com/xuehaonan27",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 8,
    perIndex: 5,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/xuehaonan27/xuehaonan27.github.io/edit/gh-pages/",
    },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/xuehaonan27" },
    { name: "mail", url: "mailto:xuehaonan27@gmail.com" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
