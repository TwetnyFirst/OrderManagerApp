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
        const pkgRef = `PKG_${now}`;
        
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
                    phone: order.phone.replace(/[^0-9]/g, ''),
                    email: order.email
                },
                sender: {
                    company: sender.company || "",
                    name: sender.name,
                    address: sender.street,
                    city: sender.city,
                    countryCode: "PL",
                    postalCode: sender.zip_code.replace('-', ''),
                    phone: sender.phone.replace(/[^0-9]/g, ''),
                    email: sender.email || "sklep@instalszop.pl"
                },
                payerFID: parseInt(sender.fid),
                parcels: Array.from({ length: packageCount }).map((_, i) => {
                    const parcel = {
                        reference: `PARCEL_${now}_${i + 1}`,
                        weight: 4,
                        content: "Produkty wentylacyjne"
                    };

                    // Move COD to parcel level for DPD REST API
                    if (isCod) {
                        parcel.services = {
                            COD: {
                                amount: parseFloat(order.total_price.toFixed(2)),
                                currency: "PLN"
                            }
                        };
                    }
                    return parcel;
                })
            }]
        };

        try {
            const response = await axios.post(`${this.baseUrl}/generatePackagesNumbers`, payload, {
                headers: this.getHeaders()
            });

            if (response.data && response.data.packages && response.data.packages[0].parcels) {
                const pkg = response.data.packages[0];
                return {
                    waybill: pkg.parcels[0].waybill,
                    sessionId: response.data.sessionId,
                    packageReference: pkg.reference,
                    parcelReference: pkg.parcels[0].reference
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
                }
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

            let base64Content = null;
            if (response.data) {
                // Priority list of fields for label data
                const contentFields = ['documentData', 'content', 'fileData'];
                for (const field of contentFields) {
                    if (response.data[field]) {
                        base64Content = response.data[field];
                        break;
                    }
                }

                if (!base64Content) {
                    // Search all fields for a long string (> 100 chars) as fallback
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

    async deletePackage(waybill) {
        // DPD REST API uses POST for deletion with a specific payload
        const payload = {
            waybill: waybill
        };

        try {
            const response = await axios.post(`${this.baseUrl}/deletePackage`, payload, {
                headers: this.getHeaders()
            });

            // If it returns 200 or 204, it's successful. 
            // DPD often returns a status field in JSON.
            if (response.data && response.data.status === 'OK') {
                return true;
            }
            
            // If status is not OK, but no exception was thrown
            console.warn('DPD Deletion Warning:', JSON.stringify(response.data));
            return true; 
        } catch (error) {
            // If DPD returns 404 for a waybill that doesn't exist in their system anymore, we consider it deleted locally
            if (error.response && error.response.status === 404) {
                console.warn(`DPD Waybill ${waybill} not found in their system, proceeding with local deletion.`);
                return true;
            }
            
            console.error('DPD Deletion Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }
}

module.exports = new DpdService();
