import dgram from 'dgram';
import { apiHandler } from '@/lib/ssh';

// POST /api/power/wol
export async function POST(request) {
  return apiHandler(
    async () => {
      const mac = (process.env.SRV_MAC || '').trim();
      const cleanMac = mac.replace(/[:-]/g, '');
      if (cleanMac.length !== 12 || !/^[0-9a-fA-F]{12}$/.test(cleanMac)) {
        throw new Error('Wake-on-LAN não configurado nas variáveis do ambiente.');
      }

      const macBytes = Buffer.from(cleanMac, 'hex');
      const packet = Buffer.alloc(102);
      packet.fill(0xff, 0, 6);
      for (let i = 0; i < 16; i++) {
        macBytes.copy(packet, 6 + i * 6);
      }

      return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        socket.once('error', () => {
          try { socket.close(); } catch (_) {}
          reject(new Error('Falha ao abrir socket de rede local para Wake-on-LAN.'));
        });

        socket.once('listening', () => {
          socket.setBroadcast(true);
          socket.send(packet, 0, packet.length, 9, '255.255.255.255', (err) => {
            try { socket.close(); } catch (_) {}
            if (err) {
              reject(new Error('Não foi possível transmitir o Magic Packet na rede local.'));
            } else {
              resolve({
                ok: true,
                message: 'Magic Packet (Wake-on-LAN) enviado para o servidor.',
              });
            }
          });
        });

        socket.bind();
      });
    },
    request,
    'POST /api/power/wol',
    { roles: ['admin'] }
  );
}
