const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class ApaczkaService {
    constructor() {
        this.baseUrl = 'https://www.apaczka.pl/api/v2';
        this.appId = process.env.APACZKA_APP_ID;
        this.appSecret = process.env.APACZKA_APP_SECRET;
    }

    async makeRequest(route, payload) {
        const requestJson = JSON.stringify(payload);
        const expires = Math.floor(Date.now() / 1000) + 1800; // 30 mins
        
        // APaczka signature requires the trailing slash in the route if it's in the URL
        const routeWithSlash = route.endsWith('/') ? route : `${route}/`;
        const signString = `${this.appId}:${routeWithSlash}:${requestJson}:${expires}`;
        const signature = crypto.createHmac('sha256', this.appSecret).update(signString).digest('hex');

        console.log(`--- APaczka Debug ---`);
        console.log(`Route used for sign: ${routeWithSlash}`);
        console.log(`Expires: ${expires}`);
        console.log(`Signature: ${signature}`);

        const formData = new URLSearchParams();
        formData.append('app_id', this.appId);
        formData.append('request', requestJson);
        formData.append('expires', expires);
        formData.append('signature', signature);

        try {
            const response = await axios.post(`${this.baseUrl}/${routeWithSlash}`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            
            if (response.data.status !== 200) {
                console.error('APaczka Error Response:', JSON.stringify(response.data));
                throw new Error(response.data.message || 'APaczka API error');
            }
            return response.data.response;
        } catch (error) {
            console.error('APaczka Request Failed:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }

    async createShipment(order, sender) {
        const isCod = order.payment_method.toLowerCase().includes('pobranie');
        const paczkomatId = (order.paczkomat_id || "").trim();
        
        // Map parcel size to dimensions (Approximate based on InPost standards)
        const sizeMap = {
            'A': { d1: 8, d2: 38, d3: 64 },
            'B': { d1: 19, d2: 38, d3: 64 },
            'C': { d1: 41, d2: 38, d3: 64 }
        };
        const dims = sizeMap[order.parcel_size || 'C'];

        const payload = {
            order: {
                service_id: 41, // InPost Paczkomat
                content: 'Wentylator',
                externalId: order.order_number || order.id,
                address: {
                    sender: {
                        name: sender.company || sender.name,
                        line1: sender.street,
                        line2: "",
                        city: sender.city,
                        postal_code: sender.zip_code,
                        country_code: 'PL',
                        phone: sender.phone.replace(/[^0-9]/g, ''),
                        email: sender.email || 'sklep@instalszop.pl',
                        contact_person: sender.name
                    },
                    receiver: {
                        name: order.company_name || order.customer_name,
                        line1: order.street || "Paczkomat " + paczkomatId,
                        line2: "",
                        city: order.city,
                        postal_code: order.zip_code,
                        country_code: 'PL',
                        phone: order.phone.replace(/[^0-9]/g, ''),
                        email: order.email,
                        contact_person: order.customer_name,
                        foreign_address_id: paczkomatId,
                        foreign_address_subtype: 'INPOST'
                    }
                },
                pickup: {
                    type: 'SELF' // Drop off at Paczkomat
                },
                shipment: [{
                    dimension1: dims.d1,
                    dimension2: dims.d2,
                    dimension3: dims.d3,
                    weight: 5,
                    shipment_type_code: 'PACZKA',
                    content: 'Wentylator'
                }],
                services: isCod ? [{
                    service_code: 'COD',
                    params: {
                        amount: order.total_price.toFixed(2),
                        currency: 'PLN'
                    }
                }] : []
            }
        };

        const result = await this.makeRequest('order_send', payload);
        
        console.log('--- APaczka Order Response ---');
        console.log(JSON.stringify(result, null, 2));

        // Robust extraction of orderId and waybill
        const orderData = result.order || result;
        const orderId = orderData.id || result.order_id;
        const waybill = orderData.waybill_number || orderData.waybill || (result.shipment && result.shipment[0].waybill);

        if (!orderId) {
            throw new Error('APaczka order_id not found in response');
        }

        return {
            orderId: orderId,
            waybill: waybill
        };
    }

    async getLabel(apaczkaOrderId) {
        const result = await this.makeRequest(`waybill/${apaczkaOrderId}`, {});
        
        console.log('--- APaczka Waybill Response ---');
        console.log(JSON.stringify(result, null, 2));

        let base64Content = null;
        let waybill = null;

        // 1. Try to get waybill from standard fields, but validate it (must not be PDF content)
        const potentialWaybill = result.waybill || (result.order && result.order.waybill);
        if (potentialWaybill && typeof potentialWaybill === 'string' && potentialWaybill.length < 50 && !potentialWaybill.startsWith('JVBERi')) {
            waybill = potentialWaybill;
        }

        if (result) {
            // 2. First pass: Find the label content (longest string starting with PDF marker)
            for (const key in result) {
                const val = result[key];
                if (typeof val === 'string' && val.length > 100) {
                    if (val.startsWith('JVBERi')) {
                        base64Content = val;
                        // We found the actual label content.
                    } else if (!base64Content || val.length > base64Content.length) {
                        // Fallback for non-standard PDF strings (e.g. not starting with JVBERi)
                        base64Content = val;
                    }
                }
            }

            // 3. Second pass: Find waybill if not already known (short string, not PDF)
            if (!waybill) {
                for (const key in result) {
                    const val = result[key];
                    if (typeof val === 'string' && val.length >= 8 && val.length <= 40) {
                        if (!val.startsWith('JVBERi') && val !== base64Content) {
                            waybill = val;
                            break;
                        }
                    }
                }
            }
        }

        if (!base64Content) {
            throw new Error('Label content not found in APaczka response');
        }

        const buffer = Buffer.from(base64Content, 'base64');
        const fileName = `label_apaczka_${apaczkaOrderId}.pdf`;
        const labelsDir = process.env.LABELS_DIR || path.join(__dirname, '../../labels');
        const filePath = path.join(labelsDir, fileName);
        
        if (!fs.existsSync(labelsDir)) {
            fs.mkdirSync(labelsDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, buffer);
        return { fileName, waybill: waybill || `AP_${apaczkaOrderId}` };
    }
}

module.exports = new ApaczkaService();
