variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Your apex domain hosted in Route 53."
  type        = string
  default     = "stallionsteelworks.com"
}

variable "from_email" {
  description = "SES From address (must be in the verified domain)."
  type        = string
  default     = "no-reply@stallionsteelworks.com"
}

variable "to_email" {
  description = "Destination email for contact form submissions."
  type        = string
  default     = "stallionsteelworks@gmail.com"
}

variable "lambda_memory" {
  description = "Lambda memory size (MB)."
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Lambda timeout (seconds)."
  type        = number
  default     = 10
}

variable "enable_api_custom_domain" {
  description = "If true, creates api.<domain_name> and maps API to it."
  type        = bool
  default     = false
}

variable "api_subdomain" {
  description = "Subdomain for custom API domain (if enabled)."
  type        = string
  default     = "api"
}
