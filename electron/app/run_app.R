#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)
port <- 7777
host <- "127.0.0.1"

if (length(args) >= 2) {
  for (i in seq(1, length(args), by = 2)) {
    if (args[i] == "--port") port <- as.integer(args[i+1])
    if (args[i] == "--host") host <- args[i+1]
  }
}

suppressPackageStartupMessages({
  library(shiny)
})

# Path to bundled shiny app inside Resources/app/shiny
app_dir <- file.path(dirname(normalizePath(sys.frame(1)$ofile)), "shiny")

message("Starting Shiny app from: ", app_dir)
message("Listening on http://", host, ":", port)

shiny::runApp(app_dir, host = host, port = port, launch.browser = FALSE)
