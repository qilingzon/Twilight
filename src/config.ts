import yaml from "js-yaml";

import type {
    SiteConfig,
    NavbarLink,
    NavbarConfig,
    SidebarConfig,
    ProfileConfig,
    AnnouncementConfig,
    PostConfig,
    FooterConfig,
    ParticleConfig,
    MusicPlayerConfig,
    PioConfig,
} from "./types/config";
export const siteConfig: SiteConfig = config.site;
            // 导航栏配置
            navbar: {
                // 导航栏透明模式 ("semi" 半透明加圆角 | "full" 完全透明 | "semifull" 动态透明)
                transparentMode: "semifull",
            },
            // 水波纹效果配置
            waves: {
                // 启用水波纹效果
                enable: true,
                // 启用性能模式 (简化波浪效果以提升性能)
                performanceMode: false,
            },
        },
        // Fullscreen 模式专属配置
        fullscreen: {
            // 层级
            zIndex: -1, // 确保壁纸在背景层
            // 壁纸透明度，0-1之间
            opacity: 0.9,
            // 背景模糊程度 (像素值)
            blur: 1,
            // 导航栏透明模式
            navbar: {
                transparentMode: "semi", // 使用半透明模式而不是完全透明
            },
        },
    },
    // OpenGraph 配置
    generateOgImages: false, // 注意开启图片生成后要渲染很长时间，不建议本地调试的时候开启
    // favicon 配置
    favicon: [
    ],
    // bangumi 配置
    bangumi: {
        // 用户 ID
        userId: "your-bangumi-id", // 可以设置为 "sai" 测试
    },
};

/**
 * 
 */

// 导航栏配置
export const navBarConfig: NavBarConfig = {
    // 链接配置 (支持多级菜单)
    links: [
        LinkPreset.Home,
        LinkPreset.Archive,
        {
            name: "Links",
            url: "/links/",
            icon: "material-symbols:link",
            children: [
                {
                    name: "GitHub",
                    url: "https://github.com/Example",
                    external: true,
                    icon: "fa6-brands:github",
                },
                {
                    name: "Bilibili",
                    url: "https://space.bilibili.com/Example",
                    external: true,
                    icon: "fa6-brands:bilibili",
                },
            ],
        },
        {
            name: "My",
            url: "/content/",
            icon: "material-symbols:person",
            children: [
                LinkPreset.Projects,
                LinkPreset.Skills,
                LinkPreset.Timeline,
                LinkPreset.Diary,
                LinkPreset.Albums,
                LinkPreset.Anime,
            ],
        },
        {
            name: "About",
            url: "/content/",
            icon: "material-symbols:info",
            children: [
                LinkPreset.About,
                LinkPreset.Friends,
            ],
        },
    ],
};

/**
 * 
 */

// 侧边栏布局配置
export const sidebarLayoutConfig: SidebarLayoutConfig = {
    // 侧边栏组件配置列表
    components: [
        {
            // 组件类型
            type: "profile", // 用户资料组件
            // 是否启用该组件
            enable: true,
            // 组件所属侧边栏
            side: "left",
            // 组件显示顺序 (数字越小越靠前)
            order: 1,
            // 组件位置
            position: "top", // 固定在顶部
        },
        {
            // 组件类型
            type: "announcement", // 公告组件
            // 是否启用该组件
            enable: true,
            // 组件所属侧边栏
            side: "left",
            // 组件显示顺序 (数字越小越靠前)
            order: 2,
            // 组件位置
            position: "top", // 固定在顶部
        },
        {
            // 组件类型
            type: "categories", // 分类组件
            // 是否启用该组件
            enable: true,
            // 组件所属侧边栏
            side: "left",
            // 组件显示顺序 (数字越小越靠前)
            order: 3,
            // 组件位置
            position: "sticky", // 粘性定位，可滚动
            // 响应式配置
            responsive: {
                // 折叠阈值
                collapseThreshold: 5, // 当分类数量超过5个时自动折叠
            },
        },
        {
            // 组件类型
            type: "tags", // 标签组件
            // 是否启用该组件
            enable: true,
            // 组件所属侧边栏
            side: "left",
            // 组件显示顺序 (数字越小越靠前)
            order: 4,
            // 组件位置
            position: "sticky", // 粘性定位，可滚动
            // 响应式配置
            responsive: {
                // 折叠阈值
                collapseThreshold: 20, // 当标签数量超过20个时自动折叠
            },
        },
        {
            // 组件类型
            type: "toc", // 目录组件
            // 是否启用该组件
            enable: true,
            // 组件所属侧边栏
            side: "right",
            // 组件显示顺序 (数字越小越靠前)
            order: 1,
            // 组件位置
            position: "sticky", // 粘性定位，可滚动
            // 自定义属性
            customProps: {
                // 目录深度 (1-6，1 表示只显示 h1 标题，2 表示显示 h1 和 h2 标题，依此类推)
                depth: 3,
            },
        },
    ],
    // 响应式布局配置
    responsive: {
        // 不同设备的布局模式 ("hidden" 不显示侧边栏 | "drawer" 抽屉模式 | "sidebar" 显示侧边栏)
        layout: {
            // 移动端
            mobile: "sidebar",
            // 平板端
            tablet: "sidebar",
            // 桌面端
            desktop: "sidebar",
        },
    },
};

>>>>>>> 69b8418 (feat: add github oauth edge functions for decap cms)

// Umami统计配置
export const umamiConfig = {
    enabled: config.umami.enabled,
    apiKey: import.meta.env.UMAMI_API_KEY ?? config.umami.apiKey,
    baseUrl: config.umami.baseUrl,
    scripts: import.meta.env.UMAMI_TRACKING_CODE ?? config.umami.scripts,
} as const;

// 导航栏配置
export const navbarConfig: NavbarConfig = {
    links: normalizeNavbarLinks(config.navbar.links),
};

// 侧边栏配置
export const sidebarConfig: SidebarConfig = config.sidebar;

// 资料配置
export const profileConfig: ProfileConfig = config.profile;

// 公告配置
export const announcementConfig: AnnouncementConfig = config.announcement;

// 文章配置
export const postConfig: PostConfig = resolvedPostConfig;

// 页脚配置
export const footerConfig: FooterConfig = config.footer;

// 粒子特效配置
export const particleConfig: ParticleConfig = config.particle;

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = config.musicPlayer;

// 看板娘配置
export const pioConfig: PioConfig = config.pio;