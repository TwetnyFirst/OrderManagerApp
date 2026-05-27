const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DpdService {
    constructor() {
        this.baseUrl = process.env.DPD_API_URL;
        this.fid = process.env.DPD_FID;
        this.username = process.env.DPD_USERNAME;
        this.password = process.env.DPD_PASSWORD;
        
        // Prepare Basic Auth header once
        this.authHeader = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
    }

    getHeaders() {
        return {
            'Authorization': this.authHeader,
            'x-dpd-fid': this.fid,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    async generatePackagesNumbers(order, sender, packageCount) {
        const isCod = order.payment_method.toLowerCase().includes('pobranie');
        const now = new Date().getTime();
        const pkgRef = `REF_${now}`;
        
        const payload = {
            generationPolicy: "STOP_ON_FIRST_ERROR",
            packages: [{
                reference: pkgRef,
                receiver: {
                    company: order.company_name || "",
                    name: order.customer_name,
                    address: order.street,
                    city: order.city,
                    countryCode: "PL",
                    postalCode: order.zip_code.replace('-', ''),
                    phone: order.phone,
                    email: order.email
                },
                sender: {
                    company: sender.company || "",
                    name: sender.name,
                    address: sender.street,
                    city: sender.city,
                    countryCode: "PL",
                    postalCode: sender.zip_code.replace('-', ''),
                    phone: sender.phone,
                    email: sender.email || "sklep@instalszop.pl"
                },
                payerFID: parseInt(this.fid),
                parcels: Array.from({ length: packageCount }).map((_, i) => ({
                    reference: `PARCEL_${now}_${i + 1}`,
                    weight: 4,
                    content: "Produkty wentylacyjne"
                })),
                services: isCod ? {
                    cod: {
                        amount: parseFloat(order.total_price.toFixed(2)),
                        currency: "PLN"
                    }
                } : undefined
            }]
        };

        try {
            const response = await axios.post(`${this.baseUrl}/generatePackagesNumbers`, payload, {
                headers: this.getHeaders()
            });

            if (response.data && response.data.packages && response.data.packages[0].parcels) {
                return {
                    waybill: response.data.packages[0].parcels[0].waybill,
                    sessionId: response.data.sessionId,
                    // n8n uses parcels[0].reference as the package reference in labels
                    packageReference: response.data.packages[0].parcels[0].reference,
                    parcelReference: "string" // n8n uses hardcoded "string" for parcel reference in labels
                };
            }
            
            console.error('DPD Unexpected Response:', JSON.stringify(response.data));
            throw new Error('Waybill not found in DPD response');
        } catch (error) {
            console.error('DPD Shipment Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }

    async generateSpedLabels(waybill, sessionId, packageReference, parcelReference) {
        const payload = {
            labelSearchParams: {
                policy: "STOP_ON_FIRST_ERROR",
                session: {
                    sessionId: sessionId,
                    packages: [{
                        reference: packageReference,
                        parcels: [{
                            reference: parcelReference,
                            waybill: waybill
                        }]
                    }],
                    type: "DOMESTIC"
                },
                documentId: "string"
            },
            outputDocFormat: "PDF",
            format: "A4",
            outputType: "BIC3",
            variant: "STANDARD"
        };

        try {
            const response = await axios.post(`${this.baseUrl}/generateSpedLabels`, payload, {
                headers: this.getHeaders()
            });

            // Robust search for Base64 content (mimicking n8n logic)
            let base64Content = null;
            if (response.data) {
                // Check common fields first
                if (response.data.content) base64Content = response.data.content;
                else if (response.data.fileData) base64Content = response.data.fileData;
                else {
                    // Search all fields for a long string (> 100 chars)
                    for (const key in response.data) {
                        const val = response.data[key];
                        if (typeof val === 'string' && val.length > 100) {
                            base64Content = val;
                            break;
                        }
                    }
                }
            }

            if (!base64Content) {
                console.error('DPD Label Full Response:', JSON.stringify(response.data));
                throw new Error('Label content not found in DPD response');
            }

            const buffer = Buffer.from(base64Content, 'base64');
            const fileName = `label_${waybill}.pdf`;
            const labelsDir = process.env.LABELS_DIR || path.join(__dirname, '../../labels');
            const filePath = path.join(labelsDir, fileName);
            
            if (!fs.existsSync(labelsDir)) {
                fs.mkdirSync(labelsDir, { recursive: true });
            }
            
            fs.writeFileSync(filePath, buffer);
            return fileName;
        } catch (error) {
            console.error('DPD Label Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }
}

module.exports = new DpdService();
