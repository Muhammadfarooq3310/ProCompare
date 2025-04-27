import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { ScraperService } from './scraper.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

interface ScrapeRequestDto {
  url: string;
  excelFileUrl: string;
  title: string;
  timeout?: number;
  isTestCrawl?: boolean;
}

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('scrape')
  async scrapeUrl(@Body() scrapeRequest: ScrapeRequestDto) {
    // Initialize the scraper with configuration
    await this.scraperService.initiate(
      {
        millisecondsTimeoutSourceRequestCount: scrapeRequest.timeout || 60000,
      },
      scrapeRequest.isTestCrawl || false,
    );

    // Perform the crawl
    const result = await this.scraperService.crawlProductsFromCategory(
      scrapeRequest.url,
    );

    // If it's not a test crawl, make sure to close the browser when done
    if (!scrapeRequest.isTestCrawl) {
      await this.scraperService.close();
    }

    // Map the products data
    const productsData = result.products.map((product) => ({
      url: product.url,
      hasHtml: !!product.html,
      data: product.data,
    }));

    // Call our new function to process the Excel file URL and products data
    const processedData = await this.scraperService.processProductsAndFile(
      scrapeRequest.excelFileUrl,
      productsData,
    );

    return {
      success: true,
      categoryUrl: scrapeRequest.url,
      productsFound: result.products.length,
      products: productsData,
      processedFileInfo: processedData,
    };
  }

  @Get('scrape')
  async scrapeUrlGet(
    @Query('url') url: string,
    @Query('timeout') timeout?: string,
  ) {
    // Initialize the scraper with configuration
    await this.scraperService.initiate(
      {
        millisecondsTimeoutSourceRequestCount: timeout
          ? parseInt(timeout)
          : 30000,
      },
      false,
    );

    // Perform the crawl
    const result = await this.scraperService.crawl(url);

    // Close the browser when done
    await this.scraperService.close();

    return {
      success: result.isValidPage,
      url: url,
      content: result.isValidPage ? result.pageSource : null,
    };
  }
  @Get('export-to-excel')
  async exportToExcel(
    @Res() res: Response,
    @Query('url') url: string,
    @Query('timeout') timeout?: string,
  ): Promise<void> {
    // Initialize the scraper with configuration
    await this.scraperService.initiate(
      {
        millisecondsTimeoutSourceRequestCount: timeout
          ? parseInt(timeout)
          : 30000,
      },
      false,
    );

    // Perform the crawl
    const result = await this.scraperService.crawlProductsFromCategory(url);

    // Close the browser when done
    await this.scraperService.close();

    // Create a new Excel workbook
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const workbook: ExcelJS.Workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const worksheet: ExcelJS.Worksheet = workbook.addWorksheet('Products');

    // If there are products, determine columns based on the first product's data structure
    if (result.products.length > 0 && result.products[0].data) {
      // Extract all unique keys from all products' data
      const allKeys: Set<string> = new Set<string>();
      result.products.forEach((product) => {
        if (product.data) {
          Object.keys(product.data).forEach((key) => allKeys.add(key));
        }
      });

      // Set header row
      const headers: string[] = ['Product URL', ...Array.from(allKeys)];
      worksheet.addRow(headers);

      // Add product data rows
      result.products.forEach((product) => {
        const rowData: any[] = [product.url];

        // Add data for each header column
        Array.from(allKeys).forEach((key) => {
          rowData.push(product.data?.[key] || '');
        });

        worksheet.addRow(rowData);
      });
    } else {
      // Fallback if no products or structured data
      worksheet.addRow(['No products found or no structured data available']);
    }

    // Set response headers for Excel file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=products-${new Date().getTime()}.xlsx`,
    );

    // Write the workbook to the response
    await workbook.xlsx.write(res);
    res.status(HttpStatus.OK).end();
  }
}
