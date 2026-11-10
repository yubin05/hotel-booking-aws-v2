# 웹 앱 인스턴스
resource "aws_instance" "web_instance_1" {
  ami           = var.al2023_ami_id
  instance_type = var.ec2_instance_type
  subnet_id     = aws_subnet.legacy_public_subnet_1.id

  vpc_security_group_ids = [
    aws_security_group.web_instance_sg.id
  ]

  key_name = aws_key_pair.ec2_key_pair.key_name

  user_data_replace_on_change = true
  user_data                   = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    # docker 설치
    dnf install -y docker
    systemctl enable --now docker
  EOF

  tags = {
    "Name" = "legacy-web_instance_1"
  }
}
