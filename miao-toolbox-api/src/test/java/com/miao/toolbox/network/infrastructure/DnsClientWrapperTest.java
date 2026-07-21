package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.network.dto.DnsRecord;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.AAAARecord;
import org.xbill.DNS.CNAMERecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.MXRecord;
import org.xbill.DNS.NSRecord;
import org.xbill.DNS.Name;
import org.xbill.DNS.PTRRecord;
import org.xbill.DNS.SOARecord;
import org.xbill.DNS.TXTRecord;

import java.net.InetAddress;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
@DisplayName("DnsClientWrapper 记录值提取")
class DnsClientWrapperTest {

    @InjectMocks
    private DnsClientWrapper wrapper;

    private Name name(String s) throws Exception {
        return Name.fromString(s.endsWith(".") ? s : s + ".");
    }

    @Test
    @DisplayName("A 记录提取 IPv4 地址")
    void aRecord() throws Exception {
        ARecord r = new ARecord(name("example.com"), DClass.IN, 300, InetAddress.getByName("93.184.216.34"));
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("A");
        assertThat(rec.getValue()).isEqualTo("93.184.216.34");
        assertThat(rec.getTtl()).isEqualTo(300L);
        assertThat(rec.getName()).isEqualTo("example.com");
    }

    @Test
    @DisplayName("AAAA 记录提取 IPv6 地址")
    void aaaaRecord() throws Exception {
        AAAARecord r = new AAAARecord(name("example.com"), DClass.IN, 300,
                InetAddress.getByName("2606:2800:220:1:248:1893:25c8:1946"));
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("AAAA");
        assertThat(rec.getValue()).isEqualTo("2606:2800:220:1:248:1893:25c8:1946");
    }

    @Test
    @DisplayName("CNAME 记录提取目标")
    void cnameRecord() throws Exception {
        CNAMERecord r = new CNAMERecord(name("www.example.com"), DClass.IN, 300, name("example.com"));
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("CNAME");
        assertThat(rec.getValue()).isEqualTo("example.com");
    }

    @Test
    @DisplayName("MX 记录提取优先级+目标")
    void mxRecord() throws Exception {
        MXRecord r = new MXRecord(name("example.com"), DClass.IN, 300, 10, name("mail.example.com"));
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("MX");
        assertThat(rec.getValue()).isEqualTo("10 mail.example.com");
    }

    @Test
    @DisplayName("TXT 记录提取文本")
    void txtRecord() throws Exception {
        TXTRecord r = new TXTRecord(name("example.com"), DClass.IN, 300, "v=spf1 include:_spf.example.com ~all");
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("TXT");
        assertThat(rec.getValue()).isEqualTo("v=spf1 include:_spf.example.com ~all");
    }

    @Test
    @DisplayName("NS 记录提取目标")
    void nsRecord() throws Exception {
        NSRecord r = new NSRecord(name("example.com"), DClass.IN, 300, name("ns1.example.com"));
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("NS");
        assertThat(rec.getValue()).isEqualTo("ns1.example.com");
    }

    @Test
    @DisplayName("SOA 记录提取字段")
    void soaRecord() throws Exception {
        SOARecord r = new SOARecord(name("example.com"), DClass.IN, 300,
                name("ns1.example.com"), name("admin.example.com"),
                2024010101, 7200, 3600, 1209600, 3600);
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("SOA");
        assertThat(rec.getValue()).contains("ns1.example.com")
                .contains("2024010101");
    }

    @Test
    @DisplayName("PTR 记录提取目标")
    void ptrRecord() throws Exception {
        PTRRecord r = new PTRRecord(name("4.3.2.1.in-addr.arpa"), DClass.IN, 300, name("host.example.com"));
        DnsRecord rec = wrapper.toDnsRecord(r);
        assertThat(rec.getType()).isEqualTo("PTR");
        assertThat(rec.getValue()).isEqualTo("host.example.com");
    }
}
