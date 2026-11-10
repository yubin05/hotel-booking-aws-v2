# NAT 인스턴스
resource "aws_instance" "nat_instance_1" {
  ami           = var.al2023_ami_id
  instance_type = var.ec2_instance_type
  subnet_id     = aws_subnet.legacy_public_subnet_1.id

  vpc_security_group_ids = [
    aws_security_group.nat_instance_1_sg.id
  ]

  # NAT 인스턴스 같은 경우는 내 패킷이 아닌 다른 패킷을 전달해주므로 체크 해제
  source_dest_check = false

  user_data_replace_on_change = true
  user_data                   = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    # iptables 설치
    dnf install -y iptables-services
    systemctl enable --now iptables

    # 커널 IP 포워딩 활성화
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf

    # iptables 마스커레이드(NAT) 설정
    IFACE="$(ip route show default | awk '/default/ {print $5; exit}')"
    /sbin/iptables -t nat -F
    /sbin/iptables -F FORWARD
    /sbin/iptables -P FORWARD ACCEPT
    /sbin/iptables -t nat -A POSTROUTING -o "$IFACE" -j MASQUERADE
    service iptables save
  EOF

  tags = {
    "Name" = "legacy-nat_instance_1"
  }
}
