import dgram from 'dgram';
import { apiHandler } from '@/lib/ssh';

// POST /api/power/wol
export async function POST(request) {
  return apiHandler(
    async () => {
      const mac = process.env.SRV_MAC || 'd0:94:66:a2:ee:38';
      const cleanMac = mac.replace(/:/g, '');
      if (cleanMac.length !== 12) {
        throw new Error('MAC Address inválido nas configurações.');
      }

      // Converte o MAC para bytes
      const macBytes = Buffer.from(cleanMac, 'hex');

      // Cria o buffer do Magic Packet (6 bytes de 0xFF + 16 vezes o MAC de 6 bytes)
      const packet = Buffer.alloc(102);
      packet.fill(0xff, 0, 6);
      for (let i = 0; i < 16; i++) {
        macBytes.copy(packet, 6 + i * 6);
      }

      // Envia via socket UDP de broadcast
      return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        socket.once('error', (err) => {
          socket.close();
          reject(new Error(`Falha no socket UDP: ${err.message}`));
        });

        socket.once('listening', () => {
          socket.setBroadcast(true);
          // Envia para o endereço de broadcast da rede na porta 9
          socket.send(packet, 0, packet.length, 9, '255.255.255.255', (err) => {
            socket.close();
            if (err) {
              reject(new Error(`Erro ao enviar pacote: ${err.message}`));
            } else {
              resolve({
                ok: true,
                message: `Magic Packet enviado com sucesso para o MAC ${mac}.`,
              });
            }
          });
        });

        // Força a escuta para permitir o setBroadcast
        socket.bind();
      });
    },
    request,
    'POST /api/power/wol'
  );
}
