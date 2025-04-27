import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { connect } from 'puppeteer-real-browser';
import OpenAI from 'openai';
import * as ExcelJS from 'exceljs';

interface CountsLimitsData {
  millisecondsTimeoutSourceRequestCount: number;
}
const client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

interface CrawlResult {
  isValidPage: boolean;
  pageSource: string | null;
}
// In scraper.service.ts
export interface ProductData {
  url: string;
  [key: string]: any;
  title: string | null;
  price: string | null;
  category: string | null;
  description: string | null;
}

type WaitUntilOption =
  | 'networkidle0'
  | 'networkidle2'
  | 'domcontentloaded'
  | 'load';

// Create type definitions for puppeteer-real-browser response
interface RealBrowserResponse {
  browser: puppeteer.Browser;
  page: puppeteer.Page;
}

@Injectable()
export class ScraperService {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;
  private pageOptions: { waitUntil: WaitUntilOption; timeout: number } = {
    waitUntil: 'networkidle2',
    timeout: 30000, // default timeout
  };
  private waitForFunction = 'document.querySelector("body")';
  private isLinkCrawlTest = false;

  private proxyPool: Array<{
    host: string;
    port: number;
    username: string;
    password: string;
  }> = [];
  private currentProxyIndex = 0;
  private blacklistedProxies: Map<string, { until: number }> = new Map();
  private readonly blacklistDuration = 30 * 60 * 1000; // 30 minutes
  private readonly maxRequestsPerProxy = 50; // Rotate after 50 requests
  private proxyRequestCount: Map<string, number> = new Map();

  constructor() {
    // Initialize proxy pool from environment variables or external config
    this.initializeProxyPool();
  }

  private initializeProxyPool(): void {
    // Example: Load proxies from environment variables or a config file
    const proxyConfigs = [
      {
        host: process.env.PROXY_HOST_1 || 'pr.oxylabs.io',
        port: parseInt(process.env.PROXY_PORT_1 || '7777', 10),
        username: process.env.OXYLABS_USERNAME || '',
        password: process.env.OXYLABS_PASSWORD || '',
      },
      // {
      //   host: process.env.PROXY_HOST_2 || 'pr.oxylabs.io',
      //   port: parseInt(process.env.PROXY_PORT_2 || '7777', 10),
      //   username: process.env.PROXY_USERNAME_2 || 'customer-Fremag_GzUxh-cc-UK',
      //   password: process.env.PROXY_PASSWORD_2 || 'AnotherPassword123=',
      // },
    ];

    this.proxyPool = proxyConfigs.filter(
      (proxy) => proxy.host && proxy.port && proxy.username && proxy.password,
    );

    if (this.proxyPool.length === 0) {
      console.warn('No valid proxies configured. Falling back to no proxy.');
    }
  }

  private getProxyKey(proxy: {
    host: string;
    port: number;
    username: string;
  }): string {
    return `${proxy.username}@${proxy.host}:${proxy.port}`;
  }

  private isProxyBlacklisted(proxy: {
    host: string;
    port: number;
    username: string;
  }): boolean {
    const key = this.getProxyKey(proxy);
    const blacklistEntry = this.blacklistedProxies.get(key);
    if (!blacklistEntry) return false;

    if (Date.now() > blacklistEntry.until) {
      this.blacklistedProxies.delete(key);
      this.proxyRequestCount.delete(key);
      return false;
    }
    return true;
  }

  private blacklistProxy(proxy: {
    host: string;
    port: number;
    username: string;
  }): void {
    const key = this.getProxyKey(proxy);
    this.blacklistedProxies.set(key, {
      until: Date.now() + this.blacklistDuration,
    });
    console.log(
      `Blacklisted proxy ${key} for ${this.blacklistDuration / 60000} minutes`,
    );
  }

  private selectNextProxy(): {
    host: string;
    port: number;
    username: string;
    password: string;
  } | null {
    if (this.proxyPool.length === 0) return null;

    for (let i = 0; i < this.proxyPool.length; i++) {
      this.currentProxyIndex =
        (this.currentProxyIndex + 1) % this.proxyPool.length;
      const proxy = this.proxyPool[this.currentProxyIndex];

      if (!this.isProxyBlacklisted(proxy)) {
        const proxyKey = this.getProxyKey(proxy);
        const requestCount = (this.proxyRequestCount.get(proxyKey) || 0) + 1;
        this.proxyRequestCount.set(proxyKey, requestCount);

        if (requestCount >= this.maxRequestsPerProxy) {
          console.log(
            `Proxy ${proxyKey} reached ${this.maxRequestsPerProxy} requests. Rotating.`,
          );
          this.proxyRequestCount.set(proxyKey, 0); // Reset count for next use
          continue;
        }

        console.log(`Selected proxy: ${proxyKey}`);
        return proxy;
      }
    }

    console.warn('No available proxies (all blacklisted or exhausted).');
    return null;
  }

  private configureProxyForPuppeteer(): {
    host: string;
    port: number;
    username: string;
    password: string;
  } | null {
    const proxy = this.selectNextProxy();
    if (!proxy) {
      console.warn('No proxy available. Proceeding without proxy.');
      return null;
    }
    return proxy;
  }

  async initiate(
    countsLimitsData: CountsLimitsData,
    isLinkCrawlTest: boolean = false,
  ): Promise<void> {
    this.pageOptions = {
      waitUntil: 'networkidle2',
      timeout: countsLimitsData.millisecondsTimeoutSourceRequestCount,
    };
    this.waitForFunction = 'document.querySelector("body")';
    this.isLinkCrawlTest = isLinkCrawlTest;
    console.log(
      `Scraper initialized with isLinkCrawlTest = ${isLinkCrawlTest}`,
    );

    try {
      const proxyConfig = this.configureProxyForPuppeteer();

      const connectOptions: any = {
        headless: true,
        executablePath: '/usr/bin/chromium-browser', // Add this line
        args: [
          '--disable-features=site-per-process',
          '--disable-web-security',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--js-flags=--max-old-space-size=256',
        ],
        customConfig: {},
        turnstile: true,
        connectOption: {},
      };

      if (proxyConfig) {
        connectOptions.args.push(
          `--proxy-server=${proxyConfig.host}:${proxyConfig.port}`,
        );
        connectOptions.proxy = {
          host: proxyConfig.host,
          port: proxyConfig.port,
          username: proxyConfig.username,
          password: proxyConfig.password,
        };
      }

      const response = (await connect(
        connectOptions,
      )) as unknown as RealBrowserResponse;

      this.browser = response.browser;
      this.page = response.page;

      await this.configureEvasionTechniques();

      if (this.page) {
        await this.page.setRequestInterception(true);
        this.page.on('request', (request: puppeteer.HTTPRequest) => {
          if (
            ['image', 'stylesheet', 'font', 'script'].includes(
              request.resourceType(),
            )
          ) {
            request.abort();
          } else {
            request.continue();
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  private async configureEvasionTechniques(): Promise<void> {
    if (!this.page) return;

    // Generate a more realistic user agent that rotates
    const userAgentsList = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    const randomUserAgent =
      userAgentsList[Math.floor(Math.random() * userAgentsList.length)];
    await this.page.setUserAgent(randomUserAgent);

    // Override navigator properties to make detection harder
    await this.page.evaluateOnNewDocument(() => {
      // Override properties that are commonly checked
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Add randomization to navigator properties
      const languages = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES'];
      Object.defineProperty(navigator, 'languages', {
        get: () => languages.sort(() => 0.5 - Math.random()).slice(0, 2),
      });

      // Add a normal-looking plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          return new Array(3).fill(null).map(() => ({
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format',
          }));
        },
      });

      // Override the permissions API
      if (window.Notification) {
        Object.defineProperty(window.Notification, 'permission', {
          get: () => 'default',
        });
      }

      // Add randomized screen resolution
      const screenWidth = 1366 + Math.floor(Math.random() * 500);
      const screenHeight = 768 + Math.floor(Math.random() * 300);

      Object.defineProperty(window.screen, 'width', { get: () => screenWidth });
      Object.defineProperty(window.screen, 'height', {
        get: () => screenHeight,
      });
      Object.defineProperty(window.screen, 'availWidth', {
        get: () => screenWidth,
      });
      Object.defineProperty(window.screen, 'availHeight', {
        get: () => screenHeight,
      });
    });
  }

  private async setupRequestInterception(): Promise<void> {
    if (!this.page) return;

    await this.page.setRequestInterception(true);

    this.page.on('request', (request: puppeteer.HTTPRequest) => {
      const resourceType = request.resourceType();
      const url = request.url();

      // Advanced request handling
      if (['image', 'stylesheet', 'font'].includes(resourceType)) {
        // Block most media resources to speed up loading
        request.abort();
      } else if (resourceType === 'script') {
        // Allow main scripts but block tracking/analytics scripts
        if (
          url.includes('google-analytics') ||
          url.includes('facebook') ||
          url.includes('amplitude') ||
          url.includes('tracker') ||
          url.includes('pixel') ||
          url.includes('gtm.js')
        ) {
          request.abort();
        } else {
          request.continue();
        }
      } else if (url.includes('captcha') || url.includes('recaptcha')) {
        // Special handling for captcha requests - sometimes allowing them is better
        request.continue();
      } else {
        // Add randomized headers to main requests
        if (
          resourceType === 'document' ||
          resourceType === 'xhr' ||
          resourceType === 'fetch'
        ) {
          const headers = request.headers();
          headers['Accept-Language'] = 'en-US,en;q=0.9';
          headers['sec-ch-ua'] =
            '"Google Chrome";v="120", "Chromium";v="120", "Not=A?Brand";v="99"';
          headers['sec-ch-ua-platform'] = '"Windows"';
          headers['sec-ch-ua-mobile'] = '?0';
          headers['Sec-Fetch-Dest'] =
            resourceType === 'document' ? 'document' : 'empty';
          headers['Sec-Fetch-Mode'] =
            resourceType === 'document' ? 'navigate' : 'cors';
          headers['Sec-Fetch-Site'] = 'same-origin';

          // Add a referer that matches the domain being scraped
          try {
            const parsedUrl = new URL(url);
            headers['Referer'] =
              `${parsedUrl.protocol}//${parsedUrl.hostname}/`;
          } catch (e) {
            console.error(e);
            // Keep the default referer if URL parsing fails
          }

          request.continue({ headers });
        } else {
          request.continue();
        }
      }
    });
  }

  async crawl(
    link: string,
    maxRetries = 3,
    preserveContext = false,
  ): Promise<CrawlResult> {
    if (!this.browser) throw new Error('Browser not initialized');

    let retryCount = 0;
    const crawlResults: CrawlResult = { isValidPage: false, pageSource: null };
    const getBackoffTime = (attempt: number) =>
      Math.min(30000, 1000 * Math.pow(2, attempt));

    while (retryCount < maxRetries) {
      let context: puppeteer.BrowserContext | null = null;
      let currentProxy = this.configureProxyForPuppeteer();

      try {
        context = await this.browser.createBrowserContext();
        this.page = await context.newPage();
        await this.configureEvasionTechniques();

        if (currentProxy) {
          await this.page.authenticate({
            username: currentProxy.username,
            password: currentProxy.password,
          });
        }

        console.log(
          `Attempt ${retryCount + 1}/${maxRetries}: Navigating to ${link} with proxy ${
            currentProxy ? this.getProxyKey(currentProxy) : 'none'
          }`,
        );

        await this.page.goto(link, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });

        const pageState = await this.page.evaluate(() => ({
          isBlocked:
            document.body.innerText.toLowerCase().includes('access denied') ||
            document.body.innerText.toLowerCase().includes('bot detected') ||
            document.title.toLowerCase().includes('403') ||
            document.title.toLowerCase().includes('429'),
        }));

        if (pageState.isBlocked && currentProxy) {
          console.log(
            `Proxy ${this.getProxyKey(currentProxy)} likely blocked. Blacklisting.`,
          );
          this.blacklistProxy(currentProxy);
          throw new Error('Proxy blocked');
        }

        crawlResults.pageSource = await this.page.evaluate(() => {
          if (!document.body) return null;
          const bodyClone = document.body.cloneNode(true) as HTMLElement;
          bodyClone
            .querySelectorAll(
              'script, style, noscript, svg, iframe, img, video, audio, canvas',
            )
            .forEach((el) => el.remove());

          Array.from(bodyClone.querySelectorAll('*')).forEach((el) => {
            const attrs = el.attributes;
            for (let i = attrs.length - 1; i >= 0; i--) {
              const name = attrs[i].name;
              if (!['class', 'id', 'href', 'src'].includes(name)) {
                el.removeAttribute(name);
              }
            }
          });
          return bodyClone.innerHTML;
        });

        crawlResults.isValidPage =
          !!crawlResults.pageSource && crawlResults.pageSource.length > 1000;

        if (!preserveContext && context) {
          await context.close();
        }

        if (crawlResults.isValidPage) {
          break;
        }

        retryCount++;
      } catch (error) {
        console.log(`Error during crawl attempt ${retryCount + 1}:`, error);

        if (this.page) {
          await this.page.close();
          this.page = null;
        }

        if (context && !preserveContext) {
          await context.close();
        }

        retryCount++;

        if (retryCount < maxRetries) {
          const backoffTime = getBackoffTime(retryCount);
          console.log(`Waiting ${backoffTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, backoffTime));

          // Rotate proxy for next attempt
          currentProxy = this.configureProxyForPuppeteer();
          if (currentProxy) {
            console.log(
              `Rotating to new proxy: ${this.getProxyKey(currentProxy)}`,
            );
          }
        } else {
          console.log(`Max retries (${maxRetries}) reached for ${link}`);
        }
      }
    }

    return crawlResults;
  }
  async crawlProductsFromCategory(categoryLink: string): Promise<{
    categoryHtml: string | null;
    products: Array<{
      url: string;
      html: string | null;
      data: ProductData | null;
    }>;
    debugInfo?: any;
  }> {
    console.log(`Starting to crawl category page: ${categoryLink}`);
    if (this.isLinkCrawlTest) {
      console.log(
        'Warning: Attempting to crawl products while in link test mode. Setting isLinkCrawlTest to false.',
      );
      this.isLinkCrawlTest = false;
    }

    const categoryResult = await this.crawl(categoryLink, 3, true);

    const debugInfo = {
      categoryLink,
      isValidPage: categoryResult.isValidPage,
      hasPageSource: !!categoryResult.pageSource,
      pageExists: !!this.page,
      pageSourceLength: categoryResult.pageSource
        ? categoryResult.pageSource.length
        : 0,
      htmlSample: categoryResult.pageSource
        ? categoryResult.pageSource.substring(0, 500)
        : null,
      timestamp: new Date().toISOString(),
    };

    if (!categoryResult.isValidPage) {
      console.error(
        'Category page is not valid - marked as invalid during crawl',
      );
      return { categoryHtml: null, products: [], debugInfo };
    }

    if (!categoryResult.pageSource) {
      console.error('Category page source is null or empty');
      return { categoryHtml: null, products: [], debugInfo };
    }

    if (!this.page) {
      console.error(
        'Puppeteer page object is null - browser context may have been closed',
      );
      return { categoryHtml: null, products: [], debugInfo };
    }

    // Get all product links from the category page
    const productLinks = await this.page.evaluate(() => {
      const urlPatterns: string[] = [
        '/product/',
        '/products/',
        '/item/',
        '/p/',
        'detail',
        'details',
        '/shop/',
        '/buy/',
        '/kaufen/',
        '/produkt/',
        '/vare/',
        '/butik/',
        '/butikk/',
        '/köp/',
      ];

      const productSelectors: string[] = [
        '.CardCTA__ProductLink',
        '.CardCTA__Wrapper a',
        '.product-card a',
        '.product a',
        '.product-item a',
        '.product-box a',
        '.card.product a',
        '.product-tile a',
        'a.product-link',
        'a.item-link',
        'a.product-title',
        'a[data-product-id]',
        'a[data-item-id]',
        '.products-grid a',
        '.product-listing a',
        '.product-grid a',
        '[class*="product"] a',
        '[class*="Product"] a',
        '[class*="item"] a',
        '[class*="Item"] a',
        '[class*="card"] a',
        '[class*="Card"] a',
        '[class*="produkt"] a',
        '[class*="Produkt"] a',
        '[class*="butik"] a',
        '[class*="butikk"] a',
        '[class*="vare"] a',
        '[class*="Vare"] a',
        '.grid a',
        '.row a[href]:not([href="#"])',
        '.list a',
      ];

      const allLinks: HTMLAnchorElement[] = Array.from(
        document.querySelectorAll('a[href]'),
      );

      const productLinks: HTMLAnchorElement[] = allLinks.filter((a) => {
        const href = a.href.toLowerCase();

        const matchesPattern = urlPatterns.some((pattern) =>
          href.includes(pattern),
        );
        if (matchesPattern) return true;

        const textContent = a.textContent?.toLowerCase() || '';
        const hasBuyWord = [
          'buy',
          'køb',
          'kaufen',
          'köp',
          'handle',
          'legg i handlekurv',
          'legg til i handlekurven',
        ].some((word) => textContent.includes(word));
        const hasPrice =
          a.textContent?.match(/\d+[.,]\d{2}/) ||
          a.closest('[class*="price"], [class*="Price"]');
        const hasProductImage =
          a.querySelector('img') ||
          a
            .closest(
              '[class*="product"], [class*="Product"], [class*="produkt"]',
            )
            ?.querySelector('img');

        const hasProductData =
          a.hasAttribute('data-product-id') ||
          a.hasAttribute('data-sku') ||
          a.hasAttribute('data-item-id') ||
          a.getAttribute('data-discover') === 'true';

        const matchesSelector = productSelectors.some((selector) => {
          try {
            return a.matches(selector);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            return false;
          }
        });

        return (
          matchesPattern ||
          hasBuyWord ||
          (hasPrice && hasProductImage) ||
          hasProductData ||
          matchesSelector
        );
      });

      const extractedLinks: string[] = productLinks.map((a) => {
        try {
          return new URL(a.href, window.location.origin).href;
        } catch (e) {
          console.log(e);
          return a.href;
        }
      });

      return [...new Set(extractedLinks)].filter(
        (url) =>
          url && (url.startsWith('http://') || url.startsWith('https://')),
      );
    });

    console.log(`Found ${productLinks.length} product links on category page`);
    const filteredProductLinks = await this.filterProductLinks(
      productLinks,
      categoryLink,
    );
    console.log(
      `Filtered down to ${filteredProductLinks.length} likely product links`,
    );
    const products = [];
    console.log(filteredProductLinks);
    // const productsToProcess = Math.min(filteredProductLinks.length, 3);
    for (let i = 0; i < filteredProductLinks.length; i++) {
      const productUrl = filteredProductLinks[i];
      console.log(
        `Crawling product ${i + 1}/${filteredProductLinks.length}: ${productUrl}`,
      );
      try {
        const maxProductRetries = 3;
        let productResult: CrawlResult | null = null;
        let retryCount = 0;
        let crawlSuccess = false;
        while (retryCount < maxProductRetries && !crawlSuccess) {
          try {
            console.log(
              `Product crawl attempt ${retryCount + 1}/${maxProductRetries}`,
            );
            productResult = await this.crawl(productUrl);
            crawlSuccess = true;
          } catch (crawlError) {
            console.error(
              `Attempt ${retryCount + 1}/${maxProductRetries} failed for ${productUrl}:`,
              crawlError,
            );
            retryCount++;

            if (retryCount >= maxProductRetries) {
              console.log(
                `All ${maxProductRetries} attempts failed for ${productUrl}, moving to next product`,
              );
              break;
            }

            const backoffTime = 2000 * retryCount;
            console.log(`Waiting ${backoffTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, backoffTime));
          }
        }
        if (!crawlSuccess) {
          products.push({ url: productUrl, html: null, data: null });
          continue;
        }
        let productData: ProductData | null = null;
        if (
          productResult &&
          productResult.isValidPage &&
          productResult.pageSource
        ) {
          try {
            productData = await this.extractProductDataWithOpenAI(
              productUrl,
              productResult.pageSource,
            );
          } catch (extractionError) {
            console.error(
              `Error extracting data from ${productUrl}:`,
              extractionError,
            );
          }
        } else {
          console.log(`Invalid page or empty content for ${productUrl}`);
        }
        products.push({
          url: productUrl,
          html:
            productResult && productResult.isValidPage
              ? productResult.pageSource
              : null,
          data: productData,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Unexpected error processing ${productUrl}:`, error);
        products.push({ url: productUrl, html: null, data: null });
      }
    }

    return {
      categoryHtml: categoryResult.pageSource,
      products: products,
      debugInfo,
    };
  }

  async processProductsAndFile(
    fileUrl: string,
    products: Array<{
      url: string;
      hasHtml: boolean;
      data: any;
    }>,
  ): Promise<{
    fileUrl: string;
    productsCount: number;
    productsData: Array<{
      url: string;
      hasHtml: boolean;
      data: any;
    }>;
    fileProcessingStatus: 'success' | 'error';
    comparisonResults?: string;
    error?: string;
  }> {
    console.log('File URL:', fileUrl);
    console.log('Products Data:', products);

    try {
      // Download the file from the AWS URL with proper type casting
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch file: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const fileData: Array<any> = [];

      // Determine file type from URL
      const isExcel =
        fileUrl.toLowerCase().endsWith('.xlsx') ||
        fileUrl.toLowerCase().endsWith('.xls');
      const isCsv = fileUrl.toLowerCase().endsWith('.csv');

      if (!isExcel && !isCsv) {
        throw new Error(
          'Unsupported file type. Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.',
        );
      }

      if (isExcel) {
        // Process Excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        workbook.eachSheet((worksheet, sheetId) => {
          console.log(`Processing Sheet ${sheetId}: ${worksheet.name}`);

          // Get header row
          const headerRow = worksheet.getRow(1);
          const headers: string[] = [];

          headerRow.eachCell((cell) => {
            headers.push(this.cellValueToString(cell.value));
          });

          // Get data rows
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
              // Skip header row
              const rowData: Record<string, any> = {};
              row.eachCell((cell, colNumber) => {
                if (colNumber <= headers.length) {
                  rowData[headers[colNumber - 1]] = this.cellValueToString(
                    cell.value,
                  );
                }
              });
              fileData.push(rowData);
            }
          });
        });
      } else {
        // Process CSV file
        const text = new TextDecoder().decode(arrayBuffer);
        const rows = text.split('\n');

        if (rows.length > 0) {
          // Get headers from first row
          const headers = rows[0].split(',').map((header) => header.trim());

          // Process data rows
          for (let i = 1; i < rows.length; i++) {
            if (rows[i].trim() === '') continue;

            const values = rows[i].split(',').map((value) => value.trim());
            const rowData: Record<string, any> = {};

            for (let j = 0; j < headers.length; j++) {
              rowData[headers[j]] = j < values.length ? values[j] : '';
            }

            fileData.push(rowData);
          }
        }
      }

      // Extract product data in a structured format
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      const productsStructuredData = products.map((product) => product.data);

      // Send both datasets to OpenAI for comparison
      const comparisonResults = await this.compareDataWithOpenAI(
        fileData,
        productsStructuredData,
      );

      return {
        fileUrl,
        productsCount: products.length,
        productsData: products,
        fileProcessingStatus: 'success',
        comparisonResults,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Error processing file:', errorMessage);

      return {
        fileUrl,
        productsCount: products.length,
        productsData: products,
        fileProcessingStatus: 'error',
        error: errorMessage,
      };
    }
  }

  // Helper method to properly convert cell values to string
  private cellValueToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }

    // Handle date objects
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Handle rich text
    if (typeof value === 'object' && value !== null) {
      // Handle rich text objects which have a 'richText' property
      if ('richText' in value) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return value.richText.map((part: any) => part.text || '').join('');
      }

      // Handle formula results
      if ('result' in value) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return String(value.result || '');
      }

      // For other objects, try JSON stringification
      try {
        return JSON.stringify(value);
      } catch {
        return '[Complex Value]';
      }
    }

    // Handle other primitive types
    return String(value);
  }

  async compareDataWithOpenAI(
    excelData: any[],
    scrapedData: any[],
  ): Promise<string> {
    try {
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Create prompt for OpenAI with specific JSON structure request
      const prompt = `
        I have two sets of product data that need to be compared:
        
        1. Excel File Data (original data): ${JSON.stringify(excelData)}
        
        2. Scraped Website Data: ${JSON.stringify(scrapedData)}
        
        Compare these datasets and provide a comprehensive analysis in the following JSON format:
        
        {
          "matching_products": [
            {
              "Product URL": "url_here",
              "Original Price": "price_from_excel",
              "Scraped Price": "price_from_scrape",
              "Price Difference (Absolute)": "absolute_diff",
              "Price Difference (Percentage)": "percentage_diff",
              "Description Difference": "yes_or_no_with_details",
              "Category Difference": "yes_or_no_with_details"
            }
          ],
          "products_only_in_excel": [
            {
              "Product URL": "url_here",
              "Title": "title_here"
            }
          ],
          "products_only_in_scraped_data": [
            {
              "Product URL": "url_here",
              "Title": "title_here"
            }
          ]
        }
        
        Return ONLY the JSON structure with no additional text or explanation. Ensure all relevant differences are captured in the appropriate fields.
      `;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4-turbo', // Use appropriate model
        messages: [
          {
            role: 'system',
            content:
              'You are a data comparison assistant that produces precise JSON outputs. Your responses must be valid JSON objects with the structure specified by the user.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' }, // Force JSON response
        max_tokens: 4000,
      });

      const responseContent = response.choices[0].message.content || '{}';

      // Validate JSON structure
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const jsonResult = JSON.parse(responseContent);

        // Ensure required properties exist
        if (!jsonResult.matching_products) jsonResult.matching_products = [];
        if (!jsonResult.products_only_in_excel)
          jsonResult.products_only_in_excel = [];
        if (!jsonResult.products_only_in_scraped_data)
          jsonResult.products_only_in_scraped_data = [];

        return JSON.stringify(jsonResult);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response as JSON:', parseError);
        // Return a valid empty structure
        return JSON.stringify({
          matching_products: [],
          products_only_in_excel: [],
          products_only_in_scraped_data: [],
        });
      }
    } catch (error) {
      console.error('OpenAI comparison error:', error);
      // Return a valid empty structure on error
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        matching_products: [],
        products_only_in_excel: [],
        products_only_in_scraped_data: [],
      });
    }
  }

  async extractProductDataWithOpenAI(
    url: string,
    htmlContent: string | null,
  ): Promise<ProductData | null> {
    if (!htmlContent) {
      console.log(`No HTML content provided for ${url}`);
      return null;
    }

    try {
      console.log(`Using OpenAI to extract data from ${url}`);

      // Truncate HTML content if it's too large to avoid token limits
      const truncatedHtml =
        htmlContent.length > 30000
          ? htmlContent.substring(0, 30000)
          : htmlContent;
      function cleanHtml(html: string) {
        return html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\s{2,}/g, ' ')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<aside[\s\S]*?<\/aside>/gi, '')
          .replace(/<svg[\s\S]*?<\/svg>/gi, '')
          .replace(/<img[^>]*>/gi, '')
          .replace(/\s{2,}/g, ' ');
      }

      const cleanedHtml = cleanHtml(truncatedHtml);

      // First, try to detect language and common login phrases
      const loginPhrases: Record<string, string[]> = {
        danish: ['login for at se priser', 'log ind for at se pris'],
        swedish: ['logga in för att se pris', 'logga in för pris'],
        norwegian: ['logg inn for å se pris', 'logg inn for pris'],
        german: ['anmelden um preis zu sehen', 'login für preise'],
        english: ['login to see price', 'sign in for price', 'login required'],
      };

      // Check for login walls in multiple languages
      let loginRequired = false;
      const htmlLower = htmlContent.toLowerCase();

      for (const language in loginPhrases) {
        if (
          loginPhrases[language].some((phrase) => htmlLower.includes(phrase))
        ) {
          loginRequired = true;
          break;
        }
      }
      const prompt = `
        Extract product information from this HTML content (page may be in English, German, Swedish, Danish, or Norwegian).

        URL: ${url}
        Login wall detected: ${loginRequired}

        EXTRACT PRECISELY:
        - TITLE: Main product name from h1/h2 elements or prominent text
        - PRICE: Look for currency symbols (€, $, £, kr), including login-required notices
        - CATEGORY: From breadcrumbs or navigation paths
        - DESCRIPTION: All relevant product details, specs, and features

        Return JSON only:
        {"isProductPage": true/false, "title": "", "price": "", "category": "", "description": "", "detectedLanguage": ""}

        HTML:
        ${cleanedHtml}`;

      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      // Parse the response
      let responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        console.error('Empty response from OpenAI');
        return null;
      }

      // Clean the response content by removing any markdown formatting
      responseContent = responseContent
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '');

      // Also trim any whitespace at the beginning and end
      responseContent = responseContent.trim();

      interface OpenAIProductResponse {
        isProductPage: boolean;
        title?: string;
        price?: string;
        category?: string;
        description?: string;
        detectedLanguage?: string;
      }

      let parsedResponse: OpenAIProductResponse;

      try {
        parsedResponse = JSON.parse(responseContent) as OpenAIProductResponse;
      } catch (error) {
        console.error('Failed to parse OpenAI response as JSON:', error);
        console.log('Raw response content:', responseContent);

        // Try to extract JSON from the text if it's not valid JSON
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedResponse = JSON.parse(jsonMatch[0]) as OpenAIProductResponse;
          } catch (innerError) {
            console.error('Failed to extract JSON from response:', innerError);
            return null;
          }
        } else {
          return null;
        }
      }

      // Log the detected language for debugging
      if (parsedResponse.detectedLanguage) {
        console.log(`Detected language: ${parsedResponse.detectedLanguage}`);
      }

      // If it's a product page, return the structured data
      if (parsedResponse && parsedResponse.isProductPage) {
        // Extract the final category name from the breadcrumb path
        let finalCategory = parsedResponse.category || null;

        if (finalCategory) {
          // Check if the category contains separators like '>', '/', '|', ':'
          const separators = ['>', '/', '|', ':', '>>', '->', '»', '//'];
          let foundSeparator = false;

          for (const separator of separators) {
            if (finalCategory.includes(separator)) {
              // Get the last part after splitting by the separator
              const parts = finalCategory.split(separator);
              finalCategory = parts[parts.length - 1].trim();
              foundSeparator = true;
              break;
            }
          }

          // If no standard separator found, try to detect breadcrumb structure
          if (!foundSeparator && finalCategory.includes(' ')) {
            // This is a heuristic - if the category looks like a path with multiple parts,
            // try to extract the most specific (last) part
            const words = finalCategory.split(' ');
            if (words.length > 3) {
              // If it's a longer string that might be a path
              finalCategory = words[words.length - 1].trim();
            }
          }
        }

        // Use login required if detected in pre-processing or by OpenAI
        const priceValue = loginRequired
          ? 'Login required'
          : parsedResponse.price || 'Login required';

        return {
          url,
          title: parsedResponse.title || null,
          price: priceValue,
          category: finalCategory,
          description: parsedResponse.description || null,
        };
      }

      // Not a product page
      return null;
    } catch (error) {
      console.error(`Error extracting data with OpenAI from ${url}:`, error);
      return null;
    }
  }

  async filterProductLinks(
    links: string[],
    categoryUrl: string,
  ): Promise<string[]> {
    if (!links || links.length === 0) {
      return [];
    }

    try {
      console.log(
        `Using OpenAI to pre-filter ${links.length} potential product links`,
      );

      // Prepare links for the prompt
      const linksText = links.map((link) => `- ${link}`).join('\n');

      const prompt = `
    I have collected the following URLs from this category page: ${categoryUrl}
    
    Please analyze these URLs and identify which ones are most likely to be product pages.
    
    Important: Product pages can have many different URL structures, and they don't necessarily 
    contain obvious identifiers like '/product/' or '/p/'. Focus on analyzing the overall URL pattern
    and path structure relative to the other URLs.
    
    Criteria to consider:
    1. URLs that appear to lead to individual items rather than collections
    2. URLs that have unique identifiers, slugs, or apparent product names
    3. URLs that differ from the category structure but follow a consistent pattern
    4. Exclude obvious non-product pages (login, account, cart, wishlist, category filters, etc.)
    
    Here are the URLs:
    ${linksText}
    
    Please return a JSON array containing only the filtered URLs that are likely product pages, like this:
    ["url1", "url2", "url3"]
    
    Return only the raw JSON array, no additional text or formatting.
    `;

      // Call OpenAI API
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at analyzing URLs and identifying product pages across diverse e-commerce sites. Respond with raw JSON array only, no markdown formatting.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      // Parse the response
      let responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        console.error('Empty response from OpenAI during link filtering');
        return links; // Return original links if we can't filter
      }

      // Clean the response content by removing any markdown formatting
      responseContent = responseContent
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '');
      responseContent = responseContent.trim();

      try {
        const filteredLinks = JSON.parse(responseContent) as string[];
        console.log(
          `Filtered ${links.length} links down to ${filteredLinks.length} likely product links`,
        );
        return filteredLinks;
      } catch (error) {
        console.error(
          'Failed to parse OpenAI response as JSON during link filtering:',
          error,
        );
        console.log('Raw response content:', responseContent);

        // Try to extract JSON array from the text if it's not valid JSON
        const jsonMatch = responseContent.match(/\[([\s\S]*)\]/);
        if (jsonMatch) {
          try {
            const arrayContent = `[${jsonMatch[1]}]`;
            const filteredLinks = JSON.parse(arrayContent) as string[];
            return filteredLinks;
          } catch (innerError) {
            console.error(
              'Failed to extract JSON array from response:',
              innerError,
            );
            return links; // Return original links if parsing fails
          }
        } else {
          return links; // Return original links if we can't extract JSON
        }
      }
    } catch (error) {
      console.error(`Error filtering product links with OpenAI:`, error);
      return links; // Return original links if there's an API error
    }
  }
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.proxyRequestCount.clear(); // Reset request counts
    } catch (error) {
      console.log('Error closing browser/page:', error);
    }
  }
}
