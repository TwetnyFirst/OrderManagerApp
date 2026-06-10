/**
 * Refined JavaScript parsing logic for Instalszop.pl orders.
 * Section-based approach for maximum reliability.
 */
const parseOrderEmail = (textContent, subject = "") => {
    const warnings = [];
    
    // Ensure inputs are strings
    textContent = textContent || "";
    subject = subject || "";
    
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
    const deliveryMatch = textContent.match(/Typ dostawy:\s*([^\n\r\t]+)/i);
    const deliveryMethod = deliveryMatch ? deliveryMatch[1].trim() : "";
    if (!deliveryMethod) warnings.push("delivery_method is missing");

    const paymentMatch = textContent.match(/Typ płatności:\s*([^\n\r\t]+)/i);
    let paymentMethod = paymentMatch ? paymentMatch[1].trim() : "";
    if (!paymentMethod) {
        warnings.push("payment_method is missing");
    } else {
        // Normalize payment method to prevent capturing HTML debris / email bodies
        const pLower = paymentMethod.toLowerCase();
        if (pLower.includes('pobran') || pLower.includes('odbior') || pLower.includes('cod')) {
            paymentMethod = "Za pobraniem";
        } else if (pLower.includes('blik')) {
            paymentMethod = "BLIK";
        } else if (pLower.includes('przelewy24') || pLower.includes('p24')) {
            paymentMethod = "Przelewy24";
        } else if (pLower.includes('przelew bank') || pLower.includes('przelew na') || pLower.includes('tradycyjn')) {
            paymentMethod = "Przelew bankowy";
        } else if (pLower.includes('payu')) {
            paymentMethod = "PayU";
        } else if (pLower.includes('tpay')) {
            paymentMethod = "tpay";
        } else if (pLower.includes('karta')) {
            paymentMethod = "Karta kredytowa";
        } else if (pLower.includes('paypo')) {
            paymentMethod = "PayPo";
        } else {
            // Safe fallback if it's too long or has table/marker noise
            if (paymentMethod.length > 30 || pLower.includes('towar') || pLower.includes('symbol') || pLower.includes('cena')) {
                paymentMethod = "Nieznany";
            }
        }
    }

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
        customer.nip = nipM ? nipM[1].trim() : "Paragon";

        // Filter block lines to parse name, street, zip, city, company
        // Filter out NIP, phone, email, and other metadata labels
        const rawLines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const filteredLines = rawLines.filter(line => {
            const lLower = line.toLowerCase();
            return !line.startsWith('NIP:') && 
                   !lLower.includes('telefon:') && 
                   !lLower.includes('e-mail:') && 
                   !lLower.includes('tel.') && 
                   !lLower.includes('dodatkowe informacje') &&
                   !lLower.includes('link do') &&
                   !lLower.startsWith('http');
        });

        if (filteredLines.length > 0) {
            customer.full_name = filteredLines[0];
            
            // Find ZIP code line index
            const zipIdx = filteredLines.findIndex(l => /\d{2}-\d{3}/.test(l));
            if (zipIdx !== -1) {
                const zipLine = filteredLines[zipIdx];
                const zipMatch = zipLine.match(/(\d{2}-\d{3})/);
                if (zipMatch) {
                    address.zip_code = zipMatch[1];
                    // The city is usually on the same line after ZIP code or on the next line
                    let possibleCity = zipLine.replace(address.zip_code, '').replace(/,/g, '').trim();
                    if (!possibleCity && filteredLines[zipIdx + 1]) {
                        possibleCity = filteredLines[zipIdx + 1];
                    }
                    address.city = possibleCity;
                }

                // Calculate company and street:
                // Lines between customer name (0) and ZIP index (zipIdx)
                const intermediateCount = zipIdx - 1;
                if (intermediateCount === 1) {
                    address.street = filteredLines[1];
                    customer.company = "";
                } else if (intermediateCount >= 2) {
                    customer.company = filteredLines[1];
                    address.street = filteredLines.slice(2, zipIdx).join(', ');
                } else {
                    // Falls back to line 0 if zip index is 1
                    address.street = filteredLines[0];
                    customer.company = "";
                }
            } else {
                // Safe fallback if no ZIP line is found
                if (filteredLines[1]) address.street = filteredLines[1];
                if (filteredLines[2]) address.city = filteredLines[2];
            }
        }
    }

    // Keep parsed billing address on customer object as reference for fallbacks
    customer.street = address.street;
    customer.city = address.city;
    customer.zip_code = address.zip_code;

    // Reset address before parsing shipping to allow accurate check and fallback
    address = { street: "", city: "", zip_code: "" };

    // --- PARSE ADRES DOSTAWY (Shipping Info) ---
    if (sections[1]) {
        let block = sections[1].trim();
        
        // Normalize multiple spaces
        block = block.replace(/\s+/g, ' ').trim();

        // 1. Remove phone number from the end of block (e.g. "666601715" or "575775294")
        block = block.replace(/[\s,]+(\d{9,12})$/, '').trim();

        // 2. Extract ZIP code (XX-XXX)
        const zipMatch = block.match(/(\d{2}-\d{3})/);
        let shippingZip = "";
        if (zipMatch) {
            shippingZip = zipMatch[1];
            address.zip_code = shippingZip;
        }

        // 3. Strip Customer Name from start using first name check
        if (customer.full_name) {
            const cleanString = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/gi, "l").toLowerCase();
            
            const blockParts = block.split(' ');
            const nameParts = customer.full_name.split(' ');
            
            if (blockParts.length > 1 && nameParts.length > 0) {
                const firstWordBlock = cleanString(blockParts[0]);
                const firstWordName = cleanString(nameParts[0]);
                
                if (firstWordBlock === firstWordName) {
                    // Match! Strip first two words (First Name + Last Name)
                    block = blockParts.slice(2).join(' ').trim();
                } else if (cleanString(block).startsWith(cleanString(customer.full_name))) {
                    // Fallback to exact match at start
                    block = block.slice(customer.full_name.length).trim().replace(/^,/, '').trim();
                }
            }
        }

        // Clean up remaining commas
        block = block.trim().replace(/^,/, '').replace(/,$/, '').trim();

        if (shippingZip) {
            const parts = block.split(shippingZip);
            let beforeZip = parts[0].trim().replace(/,$/, '').trim();
            
            if (beforeZip) {
                // Heuristic to separate Street and City
                const bCityLower = customer.city ? customer.city.toLowerCase() : "";
                const beforeClean = beforeZip.toLowerCase();
                
                if (bCityLower && beforeClean.endsWith(bCityLower)) {
                    // City is same as billing city!
                    address.city = customer.city;
                    // Street is beforeZip without the city at the end
                    const streetPart = beforeZip.slice(0, -customer.city.length).trim().replace(/,$/, '').trim();
                    address.street = streetPart;
                } else {
                    // Split by space from the right
                    const words = beforeZip.split(' ');
                    if (words.length > 1) {
                        address.city = words.pop().trim().replace(/,$/, '').trim();
                        address.street = words.join(' ').trim().replace(/,$/, '').trim();
                    } else {
                        address.city = beforeZip;
                        address.street = "";
                    }
                }
            }
        }
    }

    // Fallback/Validation: If address looks bad or incomplete, use billing data
    const isBadAddress = !address.street || !address.city || /\d/.test(address.city) || address.city.includes('@');
    
    if (isBadAddress && sections[2]) {
        address.street = address.street || customer.street || "";
        if (!address.city || /\d/.test(address.city) || address.city.includes('@')) {
            address.city = customer.city || "";
        }
        address.zip_code = address.zip_code || customer.zip_code || "";
    }

    if (address.city && address.city.includes('@')) {
        warnings.push("city contains email address");
    }

    const orderData = {
        order_number: get_field(orderId, "order_number"),
        delivery_method: deliveryMethod,
        payment_method: paymentMethod,
        customer_name: get_field(customer.full_name, "customer_name"),
        company_name: customer.company || "",
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

const parseEmailItems = (body) => {
    if (!body) return [];
    
    const startMarker = "Wartość(netto)";
    const startIdx = body.indexOf(startMarker);
    if (startIdx === -1) return [];
    
    let tableText = body.substring(startIdx + startMarker.length);
    
    const endMarkers = ["Koszt wysyłki:", "Razem netto:", "Razem brutto:"];
    let endIdx = -1;
    for (const marker of endMarkers) {
        const idx = tableText.indexOf(marker);
        if (idx !== -1 && (endIdx === -1 || idx < endIdx)) {
            endIdx = idx;
        }
    }
    
    if (endIdx !== -1) {
        tableText = tableText.substring(0, endIdx);
    }
    
    const lines = tableText.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
        
    const items = [];
    for (let i = 0; i + 4 < lines.length; i += 5) {
        const name = lines[i];
        const reference = lines[i+1];
        const priceStr = lines[i+2].replace('PLN', '').trim();
        const qtyStr = lines[i+3];
        const totalStr = lines[i+4].replace('PLN', '').trim();
        
        const price = parseFloat(priceStr.replace(/\s/g, '').replace(',', '.')) || 0;
        const quantity = parseInt(qtyStr) || 0;
        const total = parseFloat(totalStr.replace(/\s/g, '').replace(',', '.')) || 0;
        
        items.push({
            name,
            reference,
            price,
            quantity,
            total
        });
    }
    return items;
};

module.exports = { parseOrderEmail, parseEmailItems };
