const axios = require('axios');
const { db } = require('../models/db');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const log = (message) => {
    const logFile = path.resolve(__dirname, '../../prestashop.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
};


class PrestaShopService {
    constructor() {
        this.apiKey = process.env.PRESTASHOP_API_KEY;
        this.shopUrl = process.env.PRESTASHOP_SHOP_URL;
        // Set a date in the past to fetch historical orders on the first run
        this.lastCheck = new Date('2022-01-01T00:00:00Z'); 
    }

    /**
     * Generic method to make authenticated requests to PrestaShop API using the dispatcher.
     */
    async _get(resource, params = {}) {
        // Use the dispatcher URL as URL rewriting is disabled
        const endpoint = `${this.shopUrl}/webservice/dispatcher.php`;
        
        try {
            const response = await axios.get(endpoint, {
                // PrestaShop legacy API uses the key in the username field for Basic Auth
                auth: { username: this.apiKey, password: '' },
                params: {
                    ...params,
                    url: resource, // The resource is passed as a URL parameter
                    output_format: 'JSON'
                }
            });
            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.errors?.[0]?.message || error.message;
            console.error(`PrestaShop API Error fetching ${resource}:`, errorMsg);
            throw new Error(`Failed to fetch ${resource}: ${errorMsg}`);
        }
    }

    /**
     * Fetches IDs of new orders since the last check.
     */
    async getNewOrderIds() {
        try {
            // Fetch recent orders without the problematic date_add filter
            // Using sorting by ID and a limit instead
            const data = await this._get('orders', {
                'filter[current_state]': '[2|3|4|5|12|13|28]',
                display: '[id]',
                sort: '[id_DESC]',
                limit: '100'
            });
            
            if (data && data.orders) {
                const ids = data.orders.map(o => o.id);
                console.log(`[PrestaShop] Found ${ids.length} orders matching status filters.`);
                return ids;
            }
            return [];
        } catch (e) {
            console.error('Failed to get new order IDs:', e.message);
            return [];
        }
    }

    /**
     * Fetches full details for a single order and maps it to our schema.
     */
    async getOrderDetails(orderId) {
        try {
            const orderData = await this._get(`orders/${orderId}`);
            if (!orderData || !orderData.order) return null;

            const order = orderData.order;

            const customerData = await this._get(`customers/${order.id_customer}`);
            const customer = customerData ? customerData.customer : { firstname: 'Unknown', lastname: '' };

            const addressData = await this._get(`addresses/${order.id_address_delivery}`);
            const address = addressData ? addressData.address : { address1: '', city: '', postcode: '' };

            const carrierData = await this._get(`carriers/${order.id_carrier}`);
            const carrier = carrierData ? carrierData.carrier : { name: 'PrestaShop' };

            const street = [address.address1, address.address2].filter(Boolean).join(' ');

            return {
                order_number: String(order.id), // Prefer numeric ID as reference per user's examples (4295, 4294)
                customer_name: `${customer.firstname} ${customer.lastname}`.trim(),
                company_name: address.company || null,
                nip: address.dni || address.vat_number || null,
                email: customer.email,
                phone: address.phone || address.phone_mobile || "",
                street: street,
                city: address.city,
                zip_code: address.postcode,
                payment_method: order.payment,
                total_price: parseFloat(order.total_paid),
                delivery_method: carrier.name,
                status: 'New', 
                created_at: order.date_add,
                paczkomat_id: null, 
                parcel_size: 'C',
                source: 'PrestaShop'
            };
        } catch (e) {
            console.error(`Error fetching details for PrestaShop order ${orderId}:`, e.message);
            return null;
        }
    }
}

module.exports = new PrestaShopService();
