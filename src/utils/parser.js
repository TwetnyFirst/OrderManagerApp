/**
 * Refined JavaScript parsing logic for Instalszop.pl orders.
 * Section-based approach for maximum reliability.
 */
const parseOrderEmail = (textContent, subject = "") => {
    // --- 1. Extract Order ID (More flexible regex to avoid 'ó' encoding issues) ---
    let orderId = null;
    const subjectMatch = subject.match(/(?:nr|zamówienie)\s*\b(\d{4,6})\b/i);
    if (subjectMatch) {
        orderId = subjectMatch[1];
    } else {
        const bodyMatch = textContent.match(/(?:Numer zamówienia|Nr zamówienia|Nr):\s*\b(\d{4,6})\b/i);
        orderId = bodyMatch ? bodyMatch[1] : null;
    }

    if (!orderId) {
        console.warn('Could not find Order ID in email. Subject:', subject);
        return null;
    }

    // --- 2. Basic Data ---
    const deliveryMatch = textContent.match(/Typ dostawy:\s*([^\n\r]+)/i);
    const deliveryMethod = deliveryMatch ? deliveryMatch[1].trim() : "Nieznany";

    const paymentMatch = textContent.match(/Typ płatności:\s*([^\n\r]+)/i);
    const paymentMethod = paymentMatch ? paymentMatch[1].trim() : "Nieznany";

    const totalMatch = textContent.match(/Razem brutto:\s*([\d\s,.]+)/i);
    let totalPrice = 0.00;
    if (totalMatch) {
        totalPrice = parseFloat(totalMatch[1].replace(/\s/g, '').replace(',', '.').trim());
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
        
        const phoneM = block.match(/(?:Telefon:|tel\.?)\s*([^\s\n\r]+)/i);
        customer.phone = phoneM ? phoneM[1].replace(/\D/g, '').trim() : "";

        const nipM = block.match(/NIP:\s*([\d-]+)/i);
        customer.nip = nipM ? nipM[1].trim() : "";

        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            customer.full_name = lines[0];
            // If second line isn't a key field, it's probably a company name
            if (lines[1] && !lines[1].match(/NIP:|Telefon:|E-mail:/i)) {
                customer.company = lines[1];
            }
        }
    }

    // --- PARSE ADRES DOSTAWY (Shipping Info) ---
    if (sections[1]) {
        const block = sections[1].trim().replace(/\s+/g, ' ');
        const zipM = block.match(/(\d{2}-\d{3})/);
        if (zipM) {
            address.zip_code = zipM[1];
            const parts = block.split(address.zip_code);
            const beforeZip = parts[0].trim().replace(/,$/, '');
            
            // City is usually the last word before the zip code
            const cityMatch = beforeZip.match(/([^,\s]+)$/);
            if (cityMatch) {
                address.city = cityMatch[1].trim();
                let streetPart = beforeZip.replace(address.city, '').trim();
                
                // Remove customer name if it's prefixing the street
                if (customer.full_name && streetPart.startsWith(customer.full_name)) {
                    streetPart = streetPart.replace(customer.full_name, '').trim();
                }
                address.street = streetPart.replace(/,$/, '').trim();
            }
        }
    }

    // Fallback: If shipping address is empty, use billing address
    if (!address.zip_code && sections[2]) {
        const block = sections[2].trim();
        const zipM = block.match(/(\d{2}-\d{3})/);
        if (zipM) {
            address.zip_code = zipM[1];
            const lines = block.split(/\r?\n/).map(l => l.trim());
            const zIdx = lines.findIndex(l => l.includes(address.zip_code));
            if (zIdx !== -1) {
                address.city = lines[zIdx].replace(address.zip_code, '').replace(',', '').trim() || (lines[zIdx+1] ? lines[zIdx+1].trim() : "");
                address.street = lines[zIdx-1] || "";
            }
        }
    }

    return {
        order_number: orderId,
        delivery_method: deliveryMethod,
        payment_method: paymentMethod,
        customer_name: customer.full_name,
        company_name: customer.company,
        email: customer.email,
        phone: customer.phone,
        nip: customer.nip || "Paragon",
        street: address.street,
        city: address.city,
        zip_code: address.zip_code,
        total_price: totalPrice
    };
};

module.exports = { parseOrderEmail };
