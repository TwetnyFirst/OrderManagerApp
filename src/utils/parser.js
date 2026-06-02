/**
 * Refined JavaScript parsing logic for Instalszop.pl orders.
 * Section-based approach for maximum reliability.
 */
const parseOrderEmail = (textContent, subject = "") => {
    const warnings = [];
    
    // Helper to safely get a value and log a warning if it's missing
    const get_field = (value, field_name) => {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            warnings.push(`${field_name} is missing`);
            return "";
        }
        return value.trim();
    };
    
    // --- 1. Extract Order ID ---
    let orderId = null;
    const subjectMatch = subject.match(/(?:nr|zamówienie)\s*\b(\d{4,6})\b/i);
    if (subjectMatch) {
        orderId = subjectMatch[1];
    } else {
        const bodyMatch = textContent.match(/(?:Numer zamówienia|Nr zamówienia|Nr):\s*\b(\d{4,6})\b/i);
        orderId = bodyMatch ? bodyMatch[1] : null;
    }
    
    if (!orderId) {
        warnings.push('Critical: Order ID not found');
        return {
            orderData: null,
            parsing_status: 'FAILED',
            parsing_warnings: warnings
        };
    }

    // --- 2. Basic Data ---
    const deliveryMatch = textContent.match(/Typ dostawy:\s*([^\n\r]+)/i);
    const deliveryMethod = deliveryMatch ? deliveryMatch[1].trim() : "";
    if (!deliveryMethod) warnings.push("delivery_method is missing");

    const paymentMatch = textContent.match(/Typ płatności:\s*([^\n\r]+)/i);
    const paymentMethod = paymentMatch ? paymentMatch[1].trim() : "";
    if (!paymentMethod) warnings.push("payment_method is missing");

    const totalMatch = textContent.match(/Razem brutto:\s*([\d\s,.]+)/i);
    let totalPrice = 0.00;
    if (totalMatch) {
        totalPrice = parseFloat(totalMatch[1].replace(/\s/g, '').replace(',', '.').trim());
    } else {
        warnings.push("total_price is missing");
    }

    // --- 3. Section Breakdown ---
    const sections = textContent.split(/Adres Dostawy|Dane Płatnika|Dodatkowe informacje/i);
    
    let customer = { full_name: "", email: "", phone: "", company: "", nip: "" };
    let address = { street: "", city: "", zip_code: "" };

    // --- PARSE DANE PŁATNIKA (Billing Info) ---
    if (sections[2]) {
        const block = sections[2].trim();
        const emailM = block.match(/E-mail:\s*([^\s\n\r]+)/i);
        customer.email = emailM ? emailM[1].trim() : "";
        
        const phoneM = block.match(/(?:Telefon:|tel\.?)\s*([\d\s()+-]+)/i);
        customer.phone = phoneM ? phoneM[1].replace(/[()\s+-]/g, '').trim() : "";

        const nipM = block.match(/NIP:\s*([\d-]+)/i);
        customer.nip = nipM ? nipM[1].trim() : "";

        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('NIP:'));
        if (lines.length > 0) {
            customer.full_name = lines[0];
            // If second line isn't a key field, it's probably a company name
            if (lines[1] && !lines[1].match(/Telefon:|E-mail:/i) && !lines[1].match(/\d{2}-\d{3}/)) {
                customer.company = lines[1];
            }
        }
    }

    // --- PARSE ADRES DOSTAWY (Shipping Info) ---
    if (sections[1]) {
        let block = sections[1].trim();
        
        // Proactively strip phone number from the block if it's at the end
        // DPD often appends phone like "34-205 531725156"
        block = block.replace(/(\d{2}-\d{3})\s+(\d{9,12})$/, '$1');
        block = block.replace(/(\d{9,12})$/, '').trim();

        const zipMatch = block.match(/(\d{2}-\d{3})/);

        if (zipMatch) {
            address.zip_code = zipMatch[1];
            
            // Normalize block: remove customer name, replace newlines with a single space
            let flatBlock = block.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
            if (customer.full_name) {
                // Remove name only if it's at the start or clearly separated
                const nameRegex = new RegExp('^' + customer.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                flatBlock = flatBlock.replace(nameRegex, '');
            }
            flatBlock = flatBlock.trim().replace(/^,/, '').trim();

            const parts = flatBlock.split(address.zip_code);
            const beforeZip = parts[0].trim().replace(/,$/, '').trim();
            const afterZip = (parts[1] || '').trim().replace(/^,/, '').trim();

            if (afterZip) {
                // Format: [Street] ZIP [City] OR [Street] ZIP [City, Street part 2]
                const afterParts = afterZip.split(',');
                address.city = afterParts[0].trim();
                
                let street = beforeZip;
                if (afterParts.length > 1) {
                    street += (street ? ', ' : '') + afterParts.slice(1).join(',').trim();
                }
                address.street = street.trim().replace(/^,/, '').trim();
            } else if (beforeZip) {
                // Format: [Street, City] ZIP OR [City, Street] ZIP
                const beforeParts = beforeZip.split(',').map(p => p.trim());
                if (beforeParts.length > 1) {
                    const lastPart = beforeParts[beforeParts.length - 1];
                    const firstPart = beforeParts[0];
                    
                    // Heuristic: city usually doesn't have numbers
                    if (/\d/.test(lastPart) && !/\d/.test(firstPart)) {
                        address.city = firstPart;
                        address.street = beforeParts.slice(1).join(', ');
                    } else {
                        address.city = lastPart;
                        address.street = beforeParts.slice(0, -1).join(', ');
                    }
                } else {
                    const words = beforeZip.split(' ');
                    if (words.length > 1) {
                        address.city = words.pop().trim();
                        address.street = words.join(' ').trim();
                    } else {
                        address.city = beforeZip;
                    }
                }
            }
        }
    }

    // Fallback/Validation: If address looks bad or incomplete, use billing data (sections[2])
    const isBadAddress = !address.street || !address.city || /\d/.test(address.city);
    
    if (isBadAddress && sections[2]) {
        const billingAddress = { street: "", city: "", zip_code: "" };
        const block = sections[2].trim();
        const zipM = block.match(/(\d{2}-\d{3})/);
        if (zipM) {
            billingAddress.zip_code = zipM[1];
            const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            const zIdx = lines.findIndex(l => l.includes(billingAddress.zip_code));
            
            if (zIdx !== -1) {
                const cityLine = lines[zIdx].replace(billingAddress.zip_code, '').replace(',', '').trim();
                billingAddress.city = cityLine || (lines[zIdx + 1] ? lines[zIdx + 1].trim() : "");
                
                // Street is usually the line above ZIP or two lines above
                if (lines[zIdx - 1] && lines[zIdx - 1] !== customer.full_name) {
                    billingAddress.street = lines[zIdx - 1];
                } else if (lines[zIdx - 2] && lines[zIdx - 2] !== customer.full_name) {
                    billingAddress.street = lines[zIdx - 2];
                }
            }
        }

        // If billing looks better, use it
        if (billingAddress.street && billingAddress.city && !/\d/.test(billingAddress.city)) {
            address.street = billingAddress.street;
            address.city = billingAddress.city;
            address.zip_code = billingAddress.zip_code;
        }
    }

    const orderData = {
        order_number: get_field(orderId, "order_number"),
        delivery_method: deliveryMethod,
        payment_method: paymentMethod,
        customer_name: get_field(customer.full_name, "customer_name"),
        company_name: customer.company, // Optional
        email: get_field(customer.email, "email"),
        phone: get_field(customer.phone, "phone"),
        nip: customer.nip || "Paragon",
        street: get_field(address.street, "street"),
        city: get_field(address.city, "city"),
        zip_code: get_field(address.zip_code, "zip_code"),
        total_price: totalPrice
    };

    return {
        orderData,
        parsing_status: warnings.length > 0 ? 'PARTIAL' : 'OK',
        parsing_warnings: warnings
    };
};

module.exports = { parseOrderEmail };
