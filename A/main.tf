terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.55"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.region
}

# Who am I? (for ARNs)
data "aws_caller_identity" "current" {}

# Your hosted zone: Route 53 is authoritative for stallionsteelworks.com
data "aws_route53_zone" "this" {
  name         = "${var.domain_name}."
  private_zone = false
}

########################
# SES: Domain + DKIM  #
########################

resource "aws_ses_domain_identity" "this" {
  domain = var.domain_name
}

# TXT for SES verification token (_amazonses)
resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.this.verification_token]
  allow_overwrite = true
}

# Wait until SES sees the TXT verification and marks the identity "verified"
resource "aws_ses_domain_identity_verification" "verify" {
  domain = aws_ses_domain_identity.this.domain
  depends_on = [aws_route53_record.ses_verification]
}

# DKIM tokens + 3 CNAME records
resource "aws_ses_domain_dkim" "this" {
  domain = aws_ses_domain_identity.this.domain
  depends_on = [aws_ses_domain_identity_verification.verify]
}

resource "aws_route53_record" "dkim_cname" {
  count   = 3
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "${aws_ses_domain_dkim.this.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this.dkim_tokens[count.index]}.dkim.amazonses.com"]
  allow_overwrite = true
}

#############################
# IAM: Role + Policies     #
#############################

resource "aws_iam_role" "lambda_role" {
  name               = "contact-form-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

data "aws_iam_policy_document" "trust" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# Managed: logs
resource "aws_iam_role_policy_attachment" "basic_logs" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Inline: SES send
data "aws_iam_policy_document" "ses_send" {
  statement {
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ses_send" {
  name   = "ses-send-inline"
  role   = aws_iam_role.lambda_role.id
  policy = data.aws_iam_policy_document.ses_send.json
}

#############################
# Lambda build + function   #
#############################

# Zip the lambda/ dir (must contain node_modules — run `npm ci` before `terraform apply`)
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/build/function.zip"
}

resource "aws_lambda_function" "contact" {
  function_name = "contact-form-handler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  filename      = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory

  environment {
    variables = {
      FROM_EMAIL     = var.from_email         # e.g., no-reply@stallionsteelworks.com
      TO_EMAIL       = var.to_email           # e.g., stallionsteelworks@gmail.com
      ALLOWED_ORIGIN = "https://${var.domain_name}"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.basic_logs,
    aws_iam_role_policy.ses_send,
    aws_ses_domain_identity_verification.verify
  ]
}

#############################
# API Gateway HTTP API      #
#############################

resource "aws_apigatewayv2_api" "contact_api" {
  name          = "contact-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://${var.domain_name}"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type"]
    max_age       = 86400
  }
}

resource "aws_apigatewayv2_integration" "lambda_proxy" {
  api_id                 = aws_apigatewayv2_api.contact_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.contact.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_contact" {
  api_id    = aws_apigatewayv2_api.contact_api.id
  route_key = "POST /contact"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_proxy.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.contact_api.id
  name        = "$default"
  auto_deploy = true
}

# Allow API Gateway to invoke Lambda
resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "apigw-invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.contact.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${var.region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.contact_api.id}/*/POST/contact"
}

#############################
# Optional: Custom API domain
#############################
resource "aws_acm_certificate" "api_cert" {
  count             = var.enable_api_custom_domain ? 1 : 0
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "api_cert_validation" {
  count   = var.enable_api_custom_domain ? length(aws_acm_certificate.api_cert[0].domain_validation_options) : 0
  zone_id = data.aws_route53_zone.this.zone_id
  name    = aws_acm_certificate.api_cert[0].domain_validation_options[count.index].resource_record_name
  type    = aws_acm_certificate.api_cert[0].domain_validation_options[count.index].resource_record_type
  records = [aws_acm_certificate.api_cert[0].domain_validation_options[count.index].resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "api_cert_validation" {
  count                   = var.enable_api_custom_domain ? 1 : 0
  certificate_arn         = aws_acm_certificate.api_cert[0].arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

resource "aws_apigatewayv2_domain_name" "api_domain" {
  count       = var.enable_api_custom_domain ? 1 : 0
  domain_name = "${var.api_subdomain}.${var.domain_name}"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api_cert_validation[0].certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api_map" {
  count      = var.enable_api_custom_domain ? 1 : 0
  api_id     = aws_apigatewayv2_api.contact_api.id
  domain_name = aws_apigatewayv2_domain_name.api_domain[0].domain_name
  stage      = aws_apigatewayv2_stage.default.name
}

# Alias DNS for api.stallionsteelworks.com → API Gateway domain target
resource "aws_route53_record" "api_alias" {
  count   = var.enable_api_custom_domain ? 1 : 0
  zone_id = data.aws_route53_zone.this.zone_id
  name    = aws_apigatewayv2_domain_name.api_domain[0].domain_name
  type    = "A"
  alias {
    name                   = aws_apigatewayv2_domain_name.api_domain[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api_domain[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}


# Creates/updates .env.local with AWS_REGION/AWS_DEFAULT_REGION for your local shell/tools.
resource "null_resource" "write_env_local" {
  triggers = {
    region = var.region  # re-run when region var changes
  }

  provisioner "local-exec" {
    working_dir = path.module
    command     = "bash scripts/set-aws-region.local.sh ${var.region} write"
  }
}
