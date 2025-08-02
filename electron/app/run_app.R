library(shiny)
library(shinythemes)
library(shinyWidgets)


port <- httpuv::randomPort()
cat(sprintf("PORT:%d\n", port))


if (Sys.getenv("ELECTRON_PROD") == "1") {
  port <- 12345
} else {
  port <- httpuv::randomPort()
}

options(shiny.port = port)
options(shiny.host = "0.0.0.0")

ui <- navbarPage(
  title = "Electron + Shiny App",
  theme = shinytheme("cosmo"),   # Modern Bootstrap theme

  tabPanel("Dashboard",
           fluidRow(
             column(4,
                    wellPanel(
                      pickerInput("dataset", "Choose dataset:",
                                  choices = c("mtcars", "iris", "diamonds"),
                                  selected = "mtcars"),
                      actionButton("refresh", "Refresh Data")
                    )
             ),
             column(8,
                    tableOutput("dataPreview")
             )
           )
  ),

  tabPanel("Settings",
           fluidRow(
             column(6,
                    sliderInput("slider1", "Adjust Value:",
                                min = 0, max = 100, value = 50),
                    switchInput("toggleTheme", "Dark Mode", value = FALSE)
             )
           )
  ),

  tabPanel("About",
           fluidRow(
             column(12,
                    h3("About This App"),
                    p("This is a modern Shiny app packaged inside Electron."),
                    p("It uses shinythemes + shinyWidgets for a cleaner UI.")
             )
           )
  )
)



server <- function(input, output, session) {
  output$dataPreview <- renderTable({
    if (input$dataset == "mtcars") head(mtcars)
    else if (input$dataset == "iris") head(iris)
    else head(ggplot2::diamonds)
  })
}

shiny::runApp(
  list(ui = ui, server = server),
  port = port,
  host = "0.0.0.0",
  launch.browser = FALSE
)
