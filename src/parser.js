/**
 * parser.js - CSV parsing using Papa Parse
 * Returns normalized array of transaction objects
 */

export function parseCSV(fileContent) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      reject(new Error('Papa Parse not loaded'));
      return;
    }

    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        const required = ['transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'];
        const headers = results.meta.fields || [];

        const missing = required.filter(f => !headers.includes(f));
        if (missing.length > 0) {
          reject(new Error(`Missing columns: ${missing.join(', ')}`));
          return;
        }

        const transactions = results.data
          .filter(row => row.transaction_id && row.sender_id && row.receiver_id)
          .map(row => ({
            transaction_id: String(row.transaction_id).trim(),
            sender_id: String(row.sender_id).trim(),
            receiver_id: String(row.receiver_id).trim(),
            amount: parseFloat(row.amount) || 0,
            timestamp: new Date(row.timestamp).getTime(), // epoch ms
            timestamp_raw: String(row.timestamp).trim()
          }))
          .filter(row => !isNaN(row.timestamp));

        if (transactions.length === 0) {
          reject(new Error('No valid transactions found in CSV'));
          return;
        }

        resolve(transactions);
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`))
    });
  });
}
