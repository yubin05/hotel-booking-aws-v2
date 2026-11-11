resource "aws_instance" "load_test_instance_1" {
  count = var.is_load_test ? 1 : 0

  ami           = var.al2023_ami_id
  instance_type = var.load_test_instance_type
  subnet_id     = aws_subnet.legacy_public_subnet_1.id

  vpc_security_group_ids = [
    aws_security_group.load_test_instance_sg[0].id
  ]

  key_name = aws_key_pair.ec2_key_pair.key_name

  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    # docker 설치
    dnf install -y docker
    systemctl enable --now docker
  EOF

  credit_specification {
    cpu_credits = "unlimited"
  }

  tags = {
    "Name" = "legacy-load_test_instance_1"
  }
}