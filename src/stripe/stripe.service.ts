// src/stripe/stripe.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../users/entities/user.entity';
import {
  SubscribedUser,
  SubscriptionType,
} from '../users/entities/subscribed-user.entity';
import { SubscriptionEvent } from '../users/entities/subscription-event.entity';

type StripeEventPayload = Record<string, unknown>;
interface StripeSubscriptionWithPeriodEnd extends Stripe.Subscription {
  current_period_end?: number;
}

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SubscribedUser)
    private subscribedUserRepository: Repository<SubscribedUser>,
    @InjectRepository(SubscriptionEvent)
    private subscriptionEventRepository: Repository<SubscriptionEvent>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }

    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-03-31.basil',
    });
  }

  // Create checkout session (existing)
  async createCheckoutSession(
    priceId: string,
    customerId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  // Create or get customer (existing)
  async createCustomer(email: string) {
    return this.stripe.customers.create({
      email,
    });
  }

  // Construct event from payload (existing)
  constructEventFromPayload(signature: string, payload: Buffer): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not defined in environment variables',
      );
    }

    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  // NEW METHODS BELOW FOR WEBHOOKS

  // Get subscription details
  async retrieveSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['customer'],
    });
  }

  // Get customer email from subscription
  getCustomerEmail(subscription: Stripe.Subscription): string {
    const customerEmail = (subscription.customer as Stripe.Customer).email;
    if (!customerEmail) {
      throw new Error(
        `Customer email not found for subscription: ${subscription.id}`,
      );
    }
    return customerEmail;
  }

  // Get customer email from invoice
  getCustomerEmailFromInvoice(invoice: Stripe.Invoice): string {
    const customerEmail = invoice.customer_email;
    if (!customerEmail) {
      throw new Error(`Customer email not found for invoice: ${invoice.id}`);
    }
    return customerEmail;
  }

  // Get current plan from subscription
  getCurrentPlan(subscription: Stripe.Subscription): string {
    const priceId = subscription.items.data[0].price.id;
    if (priceId === process.env.PRICE_ID_SUBSCRIBER) {
      return 'subscriber-basic';
    } else if (priceId === process.env.PRICE_ID_SUBSCRIBER_PRO) {
      return 'subscriber-pro';
    } else if (priceId === process.env.PRICE_ID_ENTERPRISE) {
      return 'enterprise';
    }
    throw new Error(`Unknown or unsupported price ID ${priceId}`);
  }

  // Record subscription event
  async recordSubscriptionEvent(
    event: Stripe.Event,
    customerEmail: string,
  ): Promise<void> {
    const existingEvent = await this.subscriptionEventRepository.findOne({
      where: { eventId: event.id },
    });

    if (existingEvent) {
      console.log(`Event ${event.id} already recorded. Skipping.`);
      return;
    }

    await this.subscriptionEventRepository.save({
      eventId: event.id,
      email: customerEmail,
      eventPayload: event as unknown as StripeEventPayload,
    });
  }

  // Update user subscription
  async updateSubscribedUser(
    customerEmail: string,
    subscription: Stripe.Subscription,
    subscriptionType: string,
  ): Promise<void> {
    // Check if user exists
    const user = await this.userRepository.findOne({
      where: { email: customerEmail },
    });
    if (!user) {
      throw new Error(`User not found with email: ${customerEmail}`);
    }

    // Find or create subscribed user
    let subscribedUser = await this.subscribedUserRepository.findOne({
      where: { email: customerEmail },
    });

    // If not found, create a new entry
    if (!subscribedUser) {
      subscribedUser = new SubscribedUser();
      subscribedUser.email = customerEmail;
    }

    // Calculate next invoice date
    const subscriptionWithEnd = subscription as StripeSubscriptionWithPeriodEnd;

    // Calculate next invoice date
    let nextInvoiceDate = null;
    if (
      !subscription.cancel_at_period_end &&
      subscriptionWithEnd.current_period_end
    ) {
      try {
        const timestamp = subscriptionWithEnd.current_period_end * 1000;
        nextInvoiceDate = new Date(timestamp);
      } catch (error) {
        console.error('Error calculating next invoice date:', error);
      }
    }

    // Update subscription details
    subscribedUser.type = SubscriptionType.SUBSCRIBED;
    subscribedUser.subscriptionStatus = subscription.status;
    subscribedUser.currentPlan = subscriptionType;
    subscribedUser.nextInvoiceDate = nextInvoiceDate;

    // Save changes
    await this.subscribedUserRepository.save(subscribedUser);
  }

  // Update invoice status
  async updateInvoiceStatus(
    customerEmail: string,
    status: string,
  ): Promise<void> {
    // Find subscribed user
    const subscribedUser = await this.subscribedUserRepository.findOne({
      where: { email: customerEmail },
    });

    if (!subscribedUser) {
      // Create a new entry if not found
      const newSubscribedUser = new SubscribedUser();
      newSubscribedUser.email = customerEmail;
      newSubscribedUser.invoiceStatus = status;
      await this.subscribedUserRepository.save(newSubscribedUser);
    } else {
      // Update existing entry
      subscribedUser.invoiceStatus = status;
      await this.subscribedUserRepository.save(subscribedUser);
    }
  }

  // Reset subscription
  async resetSubscription(customerEmail: string): Promise<void> {
    const subscribedUser = await this.subscribedUserRepository.findOne({
      where: { email: customerEmail },
    });

    if (subscribedUser) {
      subscribedUser.type = SubscriptionType.FREE;
      subscribedUser.subscriptionStatus = null;
      subscribedUser.currentPlan = null;
      subscribedUser.invoiceStatus = null;
      subscribedUser.nextInvoiceDate = null;
      await this.subscribedUserRepository.save(subscribedUser);
    }
  }

  // Handle webhook events
  async handleWebhookEvent(event: Stripe.Event): Promise<{
    received: boolean;
    email?: string;
    updates: string[];
    errors: string[];
  }> {
    const updates: string[] = [];
    const errors: string[] = [];
    let customerEmail: string | undefined;

    try {
      switch (event.type) {
        case 'customer.subscription.created': {
          const subscription = await this.retrieveSubscription(
            event.data.object.id,
          );
          customerEmail = this.getCustomerEmail(subscription);
          await this.handleSubscriptionCreated(event, updates);
          break;
        }
        case 'invoice.paid': {
          const paidInvoice = event.data.object;
          customerEmail = this.getCustomerEmailFromInvoice(paidInvoice);
          await this.handleInvoicePaid(event, updates);
          break;
        }
        case 'invoice.payment_failed': {
          const failedInvoice = event.data.object;
          customerEmail = this.getCustomerEmailFromInvoice(failedInvoice);
          await this.handleInvoicePaymentFailed(event, updates);
          break;
        }
        case 'customer.subscription.updated': {
          const updatedSubscription = await this.retrieveSubscription(
            event.data.object.id,
          );
          customerEmail = this.getCustomerEmail(updatedSubscription);
          await this.handleSubscriptionUpdated(event, updates);
          break;
        }
        case 'customer.subscription.deleted': {
          const deletedSubscription = await this.retrieveSubscription(
            event.data.object.id,
          );
          customerEmail = this.getCustomerEmail(deletedSubscription);
          await this.handleSubscriptionDeleted(event, updates);
          break;
        }
        default:
          console.log(`Unhandled event type ${event.type}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Error processing webhook: ${errorMessage}`);
      console.error('Webhook error:', errorMessage);
    }

    return {
      received: true,
      email: customerEmail,
      updates,
      errors,
    };
  }

  // Event handler methods
  private async handleSubscriptionCreated(
    event: Stripe.Event,
    updates: string[],
  ): Promise<void> {
    const subscription = await this.retrieveSubscription(
      (event.data.object as Stripe.Subscription).id,
    );
    const customerEmail = this.getCustomerEmail(subscription);
    const currentPlan = this.getCurrentPlan(subscription);

    await this.updateSubscribedUser(customerEmail, subscription, currentPlan);
    await this.recordSubscriptionEvent(event, customerEmail);

    updates.push(
      `Created subscription for ${customerEmail} and recorded event ${event.id}`,
    );
  }

  private async handleInvoicePaid(
    event: Stripe.Event,
    updates: string[],
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerEmail = this.getCustomerEmailFromInvoice(invoice);

    await this.updateInvoiceStatus(customerEmail, 'paid');
    await this.recordSubscriptionEvent(event, customerEmail);

    updates.push(
      `Updated invoice status to 'paid' and recorded event ${event.id} for ${customerEmail}`,
    );
  }

  private async handleInvoicePaymentFailed(
    event: Stripe.Event,
    updates: string[],
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerEmail = this.getCustomerEmailFromInvoice(invoice);

    await this.updateInvoiceStatus(customerEmail, 'unpaid');
    await this.recordSubscriptionEvent(event, customerEmail);

    updates.push(
      `Updated invoice status to 'unpaid' and recorded event ${event.id} for ${customerEmail}`,
    );
  }

  private async handleSubscriptionUpdated(
    event: Stripe.Event,
    updates: string[],
  ): Promise<void> {
    const subscription = await this.retrieveSubscription(
      (event.data.object as Stripe.Subscription).id,
    );
    const customerEmail = this.getCustomerEmail(subscription);
    const currentPlan = this.getCurrentPlan(subscription);

    await this.updateSubscribedUser(customerEmail, subscription, currentPlan);
    await this.recordSubscriptionEvent(event, customerEmail);

    updates.push(
      `Updated subscription details and recorded event ${event.id} for ${customerEmail}`,
    );
  }

  private async handleSubscriptionDeleted(
    event: Stripe.Event,
    updates: string[],
  ): Promise<void> {
    const subscription = await this.retrieveSubscription(
      (event.data.object as Stripe.Subscription).id,
    );
    const customerEmail = this.getCustomerEmail(subscription);

    await this.resetSubscription(customerEmail);
    await this.recordSubscriptionEvent(event, customerEmail);

    updates.push(
      `Deleted subscription and recorded event ${event.id} for ${customerEmail}`,
    );
  }
}
