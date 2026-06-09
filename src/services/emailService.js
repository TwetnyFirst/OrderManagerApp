const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter using environment variables with fallbacks
const createTransporter = () => {
  const host = process.env.SMTP_HOST || process.env.IMAP_HOST;
  const user = process.env.SMTP_USER || process.env.IMAP_USER;
  const pass = process.env.SMTP_PASS || process.env.IMAP_PASSWORD;
  const port = parseInt(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  console.log(`[Email] Initializing SMTP transporter: ${host}:${port} (user: ${user})`);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });
};

let transporter = createTransporter();

const CORPORATE_SIGNATURE = `
<br><br>
<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #333; max-width: 800px; line-height: 1.4;">
    
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-bottom: 2px solid #235784; padding-bottom: 10px; margin-bottom: 15px;">
        <tr>
            <td valign="bottom" align="left">
                <div style="font-size: 22px; font-weight: bold; color: #235784; margin-bottom: 2px;">Aleksander Cylindz</div>
                <div style="color: #666; font-weight: bold; font-size: 14px;">Instalszop.pl</div>
            </td>
            
            <td valign="bottom" align="right">
                <img src="https://drive.google.com/thumbnail?id=1LTHFr4L6I81dMfzGVFruXEfEwC9sj8-f&sz=w1000" style="width: 300px; height: auto; display: block;">
            </td>
        </tr>
    </table>

    <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
            <td valign="top" width="33%" style="border-right: 1px solid #e0e0e0; padding-right: 10px;">
                <div style="color: #235784; font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">Telefony</div>
                
                <div style="margin-bottom: 4px; font-size: 13px;">
                    <span style="color: #000; font-weight: bold; display:inline-block; width: 75px;">Biuro:</span>
                    <a href="tel:+48690912712" style="text-decoration: none; color: #333;">+48 690 912 712</a>
                </div>
                <div style="margin-bottom: 4px; font-size: 13px;">
                    <span style="color: #000; font-weight: bold; display:inline-block; width: 75px;">Zamówienia:</span>
                    <a href="tel:+48690008670" style="text-decoration: none; color: #333;">+48 690 008 670</a>
                </div>
                <div style="font-size: 13px;">
                    <span style="color: #000; font-weight: bold; display:inline-block; width: 75px;">Serwis:</span>
                    <a href="tel:+48690912712" style="text-decoration: none; color: #333;">+48 690 912 712</a>
                </div>
            </td>

            <td valign="top" width="33%" style="border-right: 1px solid #e0e0e0; padding-left: 20px;">
                <div style="color: #235784; font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">E-mail</div>
                
                <div style="font-size: 13px; margin-bottom: 10px;">
                    <a href="mailto:sklep@instalszop.pl" style="text-decoration: none; color: #333;">sklep@instalszop.pl</a>
                </div>
                
                <div style="font-size: 11px; color: #888; line-height: 1.3;">
                    Kompleksowe zaopatrzenie<br>klientów hurtowych
                </div>
            </td>

            <td valign="top" width="33%" style="padding-left: 20px;">
                <div style="color: #235784; font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">Adres / NIP</div>
                
                <div style="font-size: 13px; margin-bottom: 4px;">ul. Kopanina 28-32D / 101</div>
                <div style="font-size: 13px; margin-bottom: 4px;">60-105 Poznań</div>
                <div style="font-size: 13px;">
                    <span style="font-weight: bold; color: #000;">NIP:</span> 7772822711
                </div>
            </td>
        </tr>
    </table>

    <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 5px; font-size: 10px; color: #999;">
        Klauzula poufności: Niniejszy email jest przeznaczony wyłącznie dla zamierzonego adresata, jest ściśle poufny i może być chroniony prawnie. Jeśli nie jesteście Państwem jego adresatem, proszę go nie czytać, nie drukować, nie przesyłać, nie przechowywać ani nie wykonywać żadnych działań w oparciu o niego lub załączniki. Proszę odesłać tego emaila do nadawcy a następnie niezwłocznie, trwale go usunąć. Proszę się upewnić, że posiadacie odpowiednie zabezpieczenie antywirusowe przed otwarciem jakiegokolwiek załącznika. 
    </div>
</div>
`;

/**
 * Send an email
 */
const sendEmail = async ({ to, subject, text, html }) => {
  const mailOptions = {
    from: `"InstalSzop" <${process.env.SMTP_USER || process.env.IMAP_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Success: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Error:', error);
    throw error;
  }
};

const templates = {
  customer: {
    missing_payment: (order) => ({
      subject: `Oczekiwanie na wpłatę: Zamówienie #${order.order_number} - InstalSzop`,
      html: `Dzień dobry,<br><br>Nadal nie mamy zaksięgowanej wpłaty na Państwa zamówienie nr <strong>${order.order_number}</strong>.<br><br>Uprzejmie proszę o przesłanie potwierdzenia wpłaty, przyśpieszy to realizację zamówienia.<br><br>Z poważaniem,<br>Zespół InstalSzop.pl${CORPORATE_SIGNATURE}`,
    }),
    out_of_stock: (order, productName) => ({
      subject: `Informacja o dostępności: Zamówienie #${order.order_number}`,
      html: `Dzień dobry,<br><br>Dostałem informację od producenta, że niestety nie mają na stanie <strong>${productName || 'zamówionych produktów'}</strong>.<br><br>Czas oczekiwania wynosi około 2-3 tygodnie.<br><br>Czy ten czas jest do zaakceptowania?<br><br>Z poważaniem,<br>Zespół InstalSzop.pl${CORPORATE_SIGNATURE}`,
    }),
    order_shipped: (order, waybill) => ({
      subject: `Twoje zamówienie #${order.order_number} zostało wysłane!`,
      html: `Dzień dobry ${order.customer_name},<br><br>Twoje zamówienie nr <strong>${order.order_number}</strong> właśnie opuściło nasz magazyn.<br><br>Numer listu przewozowego: <strong>${waybill}</strong><br>Serwis: ${order.delivery_method}<br><br>Możesz śledzić swoją paczkę na stronie przewoźnika.<br><br>Dziękujemy za zakupy!<br>Zespół InstalSzop.pl${CORPORATE_SIGNATURE}`,
    }),
    custom: (subject, body) => ({
      subject,
      html: `${body.replace(/\n/g, '<br>')}${CORPORATE_SIGNATURE}`,
    })
  },
  sender: {
    new_order: (sender, order) => ({
      subject: `Zlecenie wysyłki: Zamówienie #${order.order_number} (${order.city})`,
      html: `Dzień dobry,<br><br>Prosimy o przygotowanie i nadanie wysyłki dla następującego zamówienia:<br><br><strong>NR ZAMÓWIENIA:</strong> ${order.order_number}<br><br><strong>ODBIORCA:</strong><br>${order.customer_name}<br>${order.street}<br>${order.zip_code} ${order.city}<br>Tel: ${order.phone}<br><br><strong>METODA DOSTAWY:</strong> ${order.delivery_method}<br><br>Po nadaniu paczki prosimy o informację zwrotną.<br><br>Pozdrawiamy,<br>InstalSzop.pl${CORPORATE_SIGNATURE}`,
    })
  }
};

module.exports = { sendEmail, templates };
