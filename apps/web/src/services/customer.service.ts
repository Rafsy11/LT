import { dataStore } from './data-store';

export class CustomerService {
  public static async listCustomers(search = '', cluster = 'Semua cluster') {
    let result = [...dataStore.customers];

    if (cluster && cluster !== 'Semua cluster') {
      result = result.filter((c) => c.cluster === cluster);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.siaNumber.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.cluster.toLowerCase().includes(q)
      );
    }

    return result;
  }

  public static async getCustomerBySia(siaNumber: string) {
    const customer = dataStore.customers.find((c) => c.siaNumber === siaNumber);
    if (!customer) {
      throw new Error(`Pelanggan dengan SIA ${siaNumber} tidak ditemukan`);
    }

    const histories = dataStore.attenuationHistories
      .filter((h) => h.siaNumber === siaNumber)
      .slice(-10);

    return {
      customer,
      histories,
    };
  }

  public static async mutateSplitterPort(
    siaNumber: string,
    newSplitterCode: string,
    newPortNumber: number,
    actorId = 'admin-1'
  ) {
    const customer = dataStore.customers.find((c) => c.siaNumber === siaNumber);
    if (!customer) {
      throw new Error(`Pelanggan dengan SIA ${siaNumber} tidak ditemukan`);
    }

    // Check if new port is occupied
    const targetCluster = dataStore.clusters.find((c) => c.splitterCode === newSplitterCode);
    if (targetCluster) {
      const port = targetCluster.ports.find((p) => p.portNumber === newPortNumber);
      if (port && port.isOccupied && port.siaNumber !== siaNumber) {
        throw new Error(`Port ${newPortNumber} pada ${newSplitterCode} sudah terisi oleh ${port.customerName}`);
      }

      // Free old port
      const oldCluster = dataStore.clusters.find((c) => c.splitterCode === customer.splitterCode);
      if (oldCluster) {
        const oldPort = oldCluster.ports.find((p) => p.portNumber === customer.portNumber);
        if (oldPort) {
          oldPort.isOccupied = false;
          oldPort.customerName = undefined;
          oldPort.siaNumber = undefined;
        }
      }

      // Assign new port
      if (port) {
        port.isOccupied = true;
        port.customerName = customer.fullName;
        port.siaNumber = customer.siaNumber;
      }
    }

    const oldSplitter = customer.splitterCode;
    const oldPort = customer.portNumber;

    customer.splitterCode = newSplitterCode;
    customer.portNumber = newPortNumber;
    customer.updatedAt = new Date().toISOString();

    // Audit log
    dataStore.activityLogs.push({
      id: `log-${Date.now()}`,
      actorUserId: actorId,
      actorRole: 'Admin',
      actionType: 'PORT_MUTATED',
      targetEntity: 'customer',
      targetId: customer.id,
      details: {
        siaNumber,
        oldSplitter,
        oldPort,
        newSplitterCode,
        newPortNumber,
      },
      createdAt: new Date().toISOString(),
    });

    return customer;
  }
}
