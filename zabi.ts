import puppeteer from "puppeteer";
import { setTimeout } from "node:timers/promises";

(async ()=> {
        const browser = await puppeteer.launch({
        headless: false,
        userDataDir: "./zalda2",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--start-maximized",
            "--disable-gpu",
            "--single-process",
        ],
        defaultViewport: null,
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "plugins", {
            get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, "languages", {
            get: () => ["en-US", "en"],
        });
        const originalQuery = window.navigator.permissions.query.bind(
            window.navigator.permissions,
        );
        window.navigator.permissions.query = (parameters) =>
            parameters.name === "notifications"
                ? Promise.resolve({
                      state: Notification.permission,
                  } as PermissionStatus)
                : originalQuery(parameters);
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            if (parameter === 37445) return "Intel Inc.";
            if (parameter === 37446) return "Intel Iris OpenGL Engine";
            return getParameter.call(this, parameter);
        };
        (window as any).chrome = { runtime: {} };
    });

    try {
         await page.goto("https://www.x.com/", {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        await setTimeout(4000 * 400);

    } catch {} finally { 
        await page.close()
        await browser.close()
    }
})()