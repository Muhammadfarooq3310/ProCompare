// src/stripe/stripe.controller.ts
import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeService } from './stripe.service';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  // Your existing checkout session creation endpoint
  @Post('create-checkout-session')
  async createCheckoutSession(
    @Body()
    body: {
      priceId: string;
      customerId: string;
      successUrl: string;
      cancelUrl: string;
    },
  ) {
    const { priceId, customerId } = body;

    const session = await this.stripeService.createCheckoutSession(
      priceId,
      customerId,
      `${process.env.FRONTEND_LINK}users/success`,
      `${process.env.FRONTEND_LINK}users/cancel`,
    );

    return { url: session.url };
  }

  // Your existing customer creation endpoint if you had one
  @Post('create-customer')
  async createCustomer(@Body() body: { email: string }) {
    const customer = await this.stripeService.createCustomer(body.email);
    return customer;
  }

  // The webhook handler endpoint
  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    if (!signature) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('Missing stripe-signature header');
    }

    try {
      // For raw body parsing, we need to check if the body is already a Buffer
      const rawBody =
        req.body instanceof Buffer
          ? req.body
          : Buffer.from(JSON.stringify(req.body));

      const event = this.stripeService.constructEventFromPayload(
        signature,
        rawBody,
      );

      // Process the webhook event
      const { updates, errors } =
        await this.stripeService.handleWebhookEvent(event);

      if (errors.length > 0) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          received: true,
          updates,
          errors,
        });
      }

      return res.status(HttpStatus.OK).json({
        received: true,
        updates,
      });
    } catch (err) {
      console.error('Webhook error:', err.message);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: `Webhook Error: ${err.message}` });
    }
  }
}
