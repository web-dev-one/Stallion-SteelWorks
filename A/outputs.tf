output "api_base_url" {
  value       = aws_apigatewayv2_api.contact_api.api_endpoint
  description = "Base execute-api URL (use this if not enabling the custom domain)."
}

output "contact_endpoint" {
  value       = "${aws_apigatewayv2_api.contact_api.api_endpoint}/contact"
  description = "POST here from your contact page."
}

output "lambda_function_name" {
  value       = aws_lambda_function.contact.function_name
}

output "ses_domain_identity_arn" {
  value       = aws_ses_domain_identity.this.arn
}

output "custom_api_domain" {
  value       = var.enable_api_custom_domain ? aws_apigatewayv2_domain_name.api_domain[0].domain_name : ""
  description = "If enabled, your custom API domain."
}
